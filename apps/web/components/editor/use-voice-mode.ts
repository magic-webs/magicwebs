"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

// Voice mode for the AI chat, on the browser's own speech services (no server
// or API key): it listens, sends what was said when the user pauses, reads the
// reply aloud, then listens again, until it's switched off. Chrome, Edge and
// Safari have speech recognition; elsewhere the button isn't shown.
//
// Chrome's speech APIs fail quietly in several ways, each handled below:
// - an utterance that gets garbage-collected never fires `end`, so it is kept
//   in a ref and a timer ends "speaking" if `end` never comes;
// - `cancel()` straight before `speak()` can swallow the new utterance, so it
//   only cancels when something is actually playing;
// - `start()` can throw while the previous session is still closing, so it retries;
// - a session that keeps ending at once (no network, mic blocked by the OS)
//   would spin forever, so repeated instant endings turn voice mode off with a message.

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  abort(): void
  onstart: (() => void) | null
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const noSubscribe = () => () => {}

/** How long to wait for a sent utterance's reply to start before listening again. */
const AWAIT_MS = 4000
/** A session shorter than this that heard nothing counts as a failed start. */
const INSTANT_END_MS = 400
const MAX_INSTANT_ENDS = 5

const ERRORS: Record<string, string> = {
  "not-allowed": "Allow microphone access for this site to use voice mode (the camera/mic icon in the address bar).",
  "service-not-allowed": "This browser doesn't allow speech recognition here. Try Chrome or Edge in a normal window.",
  "audio-capture": "No microphone was found. Check that one is connected and not used by another app.",
  network: "Speech recognition couldn't reach its service. Check your internet connection and try again.",
  "language-not-supported": "Speech recognition doesn't support your browser's language.",
}

export type VoicePhase = "off" | "starting" | "listening" | "waiting" | "speaking"

export function useVoiceMode({
  busy,
  onUtterance,
}: {
  /** True while the AI is answering; voice mode waits instead of listening. */
  busy: boolean
  /** Called with what the user said, once they pause. */
  onUtterance: (text: string) => void
}) {
  const supported = useSyncExternalStore(noSubscribe, () => recognitionClass() !== null, () => false)
  const [on, setOn] = useState(false)
  /** The microphone is actually open (the session reported `start`). */
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [interim, setInterim] = useState("")
  /** Something was just said and sent; don't listen again until the reply has had time to start. */
  const [awaiting, setAwaiting] = useState(false)
  /** Bumped each time a listening session ends, so the next one starts. */
  const [session, setSession] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const instantEnds = useRef(0)
  const utter = useRef(onUtterance)
  useEffect(() => {
    utter.current = onUtterance
  }, [onUtterance])

  useEffect(() => {
    if (!awaiting) return
    const timer = setTimeout(() => setAwaiting(false), AWAIT_MS)
    return () => clearTimeout(timer)
  }, [awaiting])

  const stopListening = useCallback(() => {
    const r = recognition.current
    recognition.current = null
    r?.abort()
  }, [])

  const fail = useCallback(
    (message: string) => {
      stopListening()
      setError(message)
      setOn(false)
      setListening(false)
    },
    [stopListening],
  )

  // Listen whenever voice mode is on and nothing else is happening. Each session
  // ends after a pause; ending bumps `session`, which starts the next.
  useEffect(() => {
    if (!on || busy || awaiting || speaking || recognition.current) return
    const Class = recognitionClass()
    if (!Class) return
    const r = new Class()
    const startedAt = Date.now()
    let heard = false
    r.lang = navigator.language || "en-US"
    r.continuous = false
    r.interimResults = true
    r.onstart = () => setListening(true)
    r.onresult = (event) => {
      heard = true
      let text = ""
      let final = false
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript
        final ||= event.results[i].isFinal
      }
      setInterim(final ? "" : text)
      if (final && text.trim()) {
        setAwaiting(true)
        utter.current(text.trim())
      }
    }
    r.onerror = (event) => {
      // "no-speech" and "aborted" are normal: the next session starts on its own.
      if (ERRORS[event.error]) fail(ERRORS[event.error])
    }
    r.onend = () => {
      if (recognition.current !== r) return
      recognition.current = null
      setListening(false)
      setInterim("")
      if (!heard && Date.now() - startedAt < INSTANT_END_MS) {
        instantEnds.current += 1
        if (instantEnds.current >= MAX_INSTANT_ENDS) {
          fail("The microphone keeps closing right away. Check your microphone and internet connection, then try again.")
          return
        }
      } else {
        instantEnds.current = 0
      }
      setSession((n) => n + 1)
    }
    recognition.current = r
    try {
      r.start()
    } catch {
      // The previous session is still closing; try again shortly.
      recognition.current = null
      const retry = setTimeout(() => setSession((n) => n + 1), 250)
      return () => clearTimeout(retry)
    }
  }, [on, busy, awaiting, speaking, session, fail])

  const endSpeech = useCallback(() => {
    if (speechTimer.current) clearTimeout(speechTimer.current)
    speechTimer.current = null
    utterance.current = null
    setSpeaking(false)
  }, [])

  useEffect(
    () => () => {
      stopListening()
      if (speechTimer.current) clearTimeout(speechTimer.current)
      if (typeof window !== "undefined") window.speechSynthesis?.cancel()
    },
    [stopListening],
  )

  /** Read a reply aloud; listening resumes when it ends. */
  const speak = useCallback(
    (text: string) => {
      setAwaiting(false)
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined
      if (!on || !text.trim() || !synth) return
      stopListening()
      if (synth.speaking || synth.pending) synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = navigator.language || "en-US"
      u.onend = u.onerror = () => {
        if (utterance.current === u) endSpeech()
      }
      utterance.current = u
      setSpeaking(true)
      synth.resume()
      synth.speak(u)
      // If `end` never arrives, stop waiting after about as long as reading it should take.
      if (speechTimer.current) clearTimeout(speechTimer.current)
      speechTimer.current = setTimeout(() => {
        if (utterance.current === u) endSpeech()
      }, 4000 + text.length * 90)
    },
    [on, stopListening, endSpeech],
  )

  const toggle = useCallback(() => {
    setError(null)
    instantEnds.current = 0
    if (on) {
      stopListening()
      window.speechSynthesis?.cancel()
      endSpeech()
      setListening(false)
      setAwaiting(false)
      setInterim("")
    }
    setOn(!on)
  }, [on, stopListening, endSpeech])

  /** Stop reading the current reply aloud and listen again. */
  const skipSpeech = useCallback(() => {
    window.speechSynthesis?.cancel()
    endSpeech()
  }, [endSpeech])

  const dismissError = useCallback(() => setError(null), [])

  const phase: VoicePhase = !on
    ? "off"
    : speaking
      ? "speaking"
      : busy || awaiting
        ? "waiting"
        : listening
          ? "listening"
          : "starting"
  return { supported, on, phase, interim, error, toggle, speak, skipSpeech, dismissError }
}
