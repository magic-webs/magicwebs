"use client"

import { Globe, Lightbulb, RotateCcw, Shuffle, SkipForward, Sparkles, Trophy } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { readBest, saveBest } from "./best-score"

// A word game to pass the time while a site builds: unscramble words taken
// from the site itself (its name, address and page titles), then common web
// words once those run out. Tap letters or type them.

const BEST_KEY = "magicwebs:words-best"
const COLORS = ["#2f7cff", "#ff9f0a", "#0dbf7f", "#ff4d6d", "#14b8c4", "#f5c518"]

const FALLBACK = [
  "HEADER", "FOOTER", "DOMAIN", "LAUNCH", "BUTTON", "LAYOUT", "PIXEL", "MOBILE", "SEARCH", "GALLERY",
  "CONTACT", "WEBSITE", "BANNER", "SCROLL", "CURSOR", "BROWSER", "PUBLISH", "DESIGN", "IMAGE", "LOGO",
  "MENU", "HOSTING", "PREVIEW", "THEME", "WIDGET", "FORMS", "CLICK", "LINKS", "TABLET", "VISITOR",
]

/** Words too common, or too much like web plumbing, to be worth solving. */
const STOP = new Set([
  "THE", "AND", "FOR", "WITH", "YOUR", "FROM", "THAT", "THIS", "WWW", "COM", "NET", "ORG", "HTTP", "HTTPS",
  "PAGE", "INDEX", "HTML", "WELCOME", "ABOUT", "HOME", "BEST", "MORE",
])

/** The words worth solving in the site's own text: letters only, 4 to 9 of them, not all the same. */
function wordsFrom(sources: readonly string[]): string[] {
  const out = new Set<string>()
  for (const source of sources) {
    const plain = source.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    for (const w of plain.split(/[^A-Z]+/)) {
      if (w.length >= 4 && w.length <= 9 && !STOP.has(w) && new Set(w).size > 1) out.add(w)
    }
  }
  return [...out]
}

type Tile = { id: number; ch: string; color: string }
type Round = {
  key: number
  word: string
  own: boolean
  /** In the order they show in the tray. */
  tiles: Tile[]
  /** Tile ids, in the order they were put in the answer. */
  picks: number[]
  /** How many leading letters a hint has fixed in place. */
  locked: number
  status: "playing" | "solved" | "wrong"
}

let nextKey = 1

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function newRound(word: string, own: boolean): Round {
  const tiles = [...word].map((ch, id) => ({ id, ch, color: COLORS[id % COLORS.length]! }))
  let order = shuffled(tiles)
  for (let tries = 0; tries < 10 && order.map((t) => t.ch).join("") === word; tries++) order = shuffled(tiles)
  return { key: nextKey++, word, own, tiles: order, picks: [], locked: 0, status: "playing" }
}

type Deal = { round: Round; used: readonly string[] }

/** The next word: the site's own words first, at random, then the web words; once all are used, start over. */
function deal(sources: readonly string[], used: readonly string[]): Deal {
  let own = wordsFrom(sources).filter((w) => !used.includes(w))
  let web = FALLBACK.filter((w) => !used.includes(w))
  if (!own.length && !web.length) {
    used = []
    own = wordsFrom(sources)
    web = FALLBACK
  }
  const pool = own.length ? own : web
  const word = pool[Math.floor(Math.random() * pool.length)]!
  return { round: newRound(word, own.length > 0), used: [...used, word] }
}

export function WordsGame({ sources }: { sources: readonly string[] }) {
  const [{ round }, setDeal] = useState(() => deal(sources, []))
  const setRound = (next: Round | ((r: Round) => Round)) =>
    setDeal((d) => ({ ...d, round: typeof next === "function" ? next(d.round) : next }))
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [solved, setSolved] = useState(0)
  const [best, setBest] = useState(() => readBest(BEST_KEY))
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null)

  // The page titles arrive as the site builds; a new round reads the latest.
  const sourcesRef = useRef(sources)
  useEffect(() => {
    sourcesRef.current = sources
  }, [sources])

  const next = () => {
    const sources = sourcesRef.current
    setDeal((d) => deal(sources, d.used))
  }
  const tile = (id: number) => round.tiles.find((t) => t.id === id)!

  useEffect(() => {
    if (round.status === "solved") {
      const t = setTimeout(() => {
        const sources = sourcesRef.current
        setDeal((d) => deal(sources, d.used))
      }, 800)
      return () => clearTimeout(t)
    }
    if (round.status === "wrong") {
      const t = setTimeout(
        () => setDeal((d) => ({ ...d, round: { ...d.round, picks: d.round.picks.slice(0, d.round.locked), status: "playing" } })),
        550,
      )
      return () => clearTimeout(t)
    }
  }, [round.status, round.key])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1100)
    return () => clearTimeout(t)
  }, [toast])

  function settle(r: Round): Round {
    if (r.picks.length < r.word.length) return r
    const answer = r.picks.map((id) => r.tiles.find((t) => t.id === id)!.ch).join("")
    if (answer !== r.word) return { ...r, status: "wrong" }
    const gained = Math.max(5, r.word.length * 10 - r.locked * 15) + streak * 5
    const nextScore = score + gained
    setScore(nextScore)
    setStreak(streak + 1)
    setSolved(solved + 1)
    if (nextScore > best) {
      setBest(nextScore)
      saveBest(BEST_KEY, nextScore)
    }
    setToast({ key: Date.now(), text: streak >= 2 ? `Streak ×${streak + 1} +${gained}` : `+${gained}` })
    return { ...r, status: "solved" }
  }

  function pick(id: number) {
    if (round.status !== "playing" || round.picks.includes(id) || round.picks.length >= round.word.length) return
    setRound(settle({ ...round, picks: [...round.picks, id] }))
  }

  function unpick(position: number) {
    if (round.status !== "playing" || position < round.locked) return
    setRound({ ...round, picks: round.picks.filter((_, i) => i !== position) })
  }

  function hint() {
    if (round.status !== "playing" || round.locked >= round.word.length - 1) return
    // Fix the first locked + 1 letters in place, each with a tile carrying that letter.
    const picks: number[] = []
    for (const ch of round.word.slice(0, round.locked + 1)) {
      picks.push(round.tiles.find((t) => t.ch === ch && !picks.includes(t.id))!.id)
    }
    setRound({ ...round, picks, locked: round.locked + 1 })
  }

  function skip() {
    if (round.status !== "playing") return
    setStreak(0)
    setToast({ key: Date.now(), text: `It was ${round.word}` })
    next()
  }

  function restart() {
    setScore(0)
    setStreak(0)
    setSolved(0)
    setDeal(deal(sourcesRef.current, []))
  }

  // Typing works too: a letter picks a matching tile, Backspace takes the last one back.
  const keys = useRef({ pick, unpick, round })
  useEffect(() => {
    keys.current = { pick, unpick, round }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable]")) return
      const { pick, unpick, round } = keys.current
      if (e.key === "Backspace") {
        e.preventDefault()
        unpick(round.picks.length - 1)
        return
      }
      const ch = e.key.length === 1 ? e.key.toUpperCase() : ""
      if (!/^[A-Z]$/.test(ch)) return
      const t = round.tiles.find((t) => t.ch === ch && !round.picks.includes(t.id))
      if (t) pick(t.id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const len = round.word.length
  const columns = { gridTemplateColumns: `repeat(${len}, minmax(0, 44px))` }
  const LETTER = cn(
    "grid aspect-square place-items-center rounded-[10px] text-white text-[length:clamp(16px,4.2vw,22px)] font-bold",
    "[background:linear-gradient(160deg,color-mix(in_srgb,var(--block)_78%,#fff),var(--block)_55%)]",
    "shadow-[inset_0_1px_#ffffff59,inset_0_-2px_#0000002e,0_1px_2px_#00000033] [text-shadow:0_1px_1px_#00000040]",
  )
  const EMPTY = "aspect-square rounded-[10px] bg-[#ffffff0d] shadow-[inset_0_0_0_1px_#ffffff08]"
  const ACTION = cn(
    "flex items-center justify-center gap-1.5 rounded-[14px] py-3 bg-mw-sunk text-mw-muted text-[13px] font-semibold",
    "transition-[transform,color] duration-200 ease-mw-out hover:text-mw-fg hover:[transform:translateY(-1px)] disabled:opacity-40 [&_svg]:size-4",
  )

  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col gap-3.5 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-mw-subtle text-[13px] font-medium">Score</span>
          <span className="text-[28px] font-[650] tracking-[-0.04em] tabular-nums leading-none">{score}</span>
        </div>
        <span className="text-mw-faint text-[13px] tabular-nums">{solved} solved</span>
        <div className="ml-auto inline-flex items-center gap-[5px] rounded-full px-2.5 py-1 bg-white shadow-mw-chip text-mw-muted text-[13px] font-[550] tabular-nums [&_svg]:size-3.5 [&_svg]:text-[#ff9f0a]">
          <Trophy aria-hidden="true" />
          <span>Best {best}</span>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-full text-mw-muted transition-[background-color] duration-200 ease-mw-out hover:bg-[#8080801f] [&_svg]:size-4"
          onClick={restart}
          aria-label="New game"
        >
          <RotateCcw />
        </button>
      </div>

      <div
        className={cn(
          "relative flex aspect-[5/4] flex-col items-center justify-center gap-[clamp(14px,4%,24px)] rounded-[18px] p-4",
          "bg-[linear-gradient(160deg,#27272a,#18181b)] shadow-[inset_0_1px_#ffffff1a,0_0_0_1px_#00000014,0_20px_40px_-16px_#00000040]",
        )}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-[#ffffff14] text-[#ffffffb3] text-[12px] font-semibold [&_svg]:size-3.5">
          {round.own ? <Sparkles className="text-[#f5c518]" /> : <Globe />}
          {round.own ? "From your site" : "Web word"} · {len} letters
        </span>

        <div className="grid w-full justify-center gap-1.5" style={columns} aria-label="Your answer" aria-live="polite">
          {Array.from({ length: len }, (_, i) => {
            const id = round.picks[i]
            if (id === undefined) return <span key={i} className={EMPTY} />
            const t = tile(id)
            const color = round.status === "solved" ? "#0dbf7f" : round.status === "wrong" ? "#ff4d6d" : t.color
            return (
              <button
                key={i}
                type="button"
                className={cn(LETTER, "animate-[mw-badge_0.15s_var(--ease-mw-out)]", i < round.locked && "shadow-[inset_0_0_0_2px_#ffffffb3]")}
                style={{ "--block": color } as React.CSSProperties}
                onClick={() => unpick(i)}
                aria-label={i < round.locked ? `${t.ch}, given by a hint` : `${t.ch}, tap to take back`}
              >
                {t.ch}
              </button>
            )
          })}
        </div>

        <div className="grid w-full justify-center gap-1.5" style={columns} aria-label="Letters">
          {round.tiles.map((t) =>
            round.picks.includes(t.id) ? (
              <span key={t.id} className={EMPTY} />
            ) : (
              <button
                key={t.id}
                type="button"
                className={cn(LETTER, "transition-transform duration-150 ease-mw-out hover:[transform:translateY(-2px)]")}
                style={{ "--block": t.color } as React.CSSProperties}
                onClick={() => pick(t.id)}
              >
                {t.ch}
              </button>
            ),
          )}
        </div>

        {toast && (
          <span
            key={toast.key}
            className={cn(
              "absolute top-[42%] left-1/2 z-[2] -translate-x-1/2 rounded-full px-3.5 py-1.5 bg-white shadow-[0_10px_30px_-8px_#00000040]",
              "text-[#18181b] text-[15px] font-bold tracking-[-0.02em] whitespace-nowrap pointer-events-none animate-[mw-toast_1.1s_var(--ease-mw-out)_forwards]",
            )}
          >
            {toast.text}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <button type="button" className={ACTION} onClick={hint} disabled={round.status !== "playing" || round.locked >= len - 1}>
          <Lightbulb />
          Hint
        </button>
        <button
          type="button"
          className={ACTION}
          onClick={() => setRound({ ...round, tiles: shuffled(round.tiles) })}
          disabled={round.status !== "playing"}
        >
          <Shuffle />
          Shuffle
        </button>
        <button type="button" className={ACTION} onClick={skip} disabled={round.status !== "playing"}>
          <SkipForward />
          Skip
        </button>
      </div>
    </div>
  )
}
