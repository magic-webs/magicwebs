"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

// Voice mode for the AI chat, on the browser's own speech services (no server
// or API key): it listens, sends what was said when the user pauses, reads the
// reply aloud, then listens again, until it's switched off. Chrome, Edge and
// Safari have speech recognition; elsewhere the button isn't shown.

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  abort(): void
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

export type VoicePhase = "off" | "listening" | "waiting" | "speaking"

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
  const [speaking, setSpeaking] = useState(false)
  const [interim, setInterim] = useState("")
  /** Something was just said and sent; don't listen again until the reply has had time to start. */
  const [awaiting, setAwaiting] = useState(false)
  /** Bumped each time a listening session ends, so the next one starts. */
  const [session, setSession] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
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

  // Listen whenever voice mode is on and nothing else is happening. A pause with
  // no speech ends the session; ending bumps `session`, which starts the next.
  useEffect(() => {
    if (!on || busy || awaiting || speaking || recognition.current) return
    const Class = recognitionClass()
    if (!Class) return
    const r = new Class()
    r.lang = navigator.language || "en-US"
    r.continuous = false
    r.interimResults = true
    r.onresult = (event) => {
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
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Allow microphone access to use voice mode.")
        setOn(false)
      } else if (event.error === "audio-capture") {
        setError("No microphone was found.")
        setOn(false)
      }
    }
    r.onend = () => {
      if (recognition.current === r) recognition.current = null
      setInterim("")
      setSession((n) => n + 1)
    }
    recognition.current = r
    try {
      r.start()
    } catch {
      recognition.current = null
    }
  }, [on, busy, awaiting, speaking, session])

  useEffect(
    () => () => {
      stopListening()
      if (typeof window !== "undefined") window.speechSynthesis?.cancel()
    },
    [stopListening],
  )

  /** Read a reply aloud; listening resumes when it ends. */
  const speak = useCallback(
    (text: string) => {
      setAwaiting(false)
      if (!on || !text.trim() || typeof window === "undefined" || !window.speechSynthesis) return
      stopListening()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = navigator.language || "en-US"
      u.onend = u.onerror = () => setSpeaking(false)
      setSpeaking(true)
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    },
    [on, stopListening],
  )

  const toggle = useCallback(() => {
    setError(null)
    if (on) {
      stopListening()
      window.speechSynthesis?.cancel()
      setSpeaking(false)
      setAwaiting(false)
      setInterim("")
    }
    setOn(!on)
  }, [on, stopListening])

  /** Stop reading the current reply aloud and listen again. */
  const skipSpeech = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  const dismissError = useCallback(() => setError(null), [])

  const phase: VoicePhase = !on ? "off" : speaking ? "speaking" : busy || awaiting ? "waiting" : "listening"
  return { supported, on, phase, interim, error, toggle, speak, skipSpeech, dismissError }
}
