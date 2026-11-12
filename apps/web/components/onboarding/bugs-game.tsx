"use client"

import { Bug, Heart, Pause, Play, RotateCcw, Sparkles, Trophy } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

import { readBest, saveBest } from "./best-score"

// A reflex game to pass the time while a site builds: bugs pop up in the
// sections of a page; tap them before they get away, and leave the features
// alone. Three lives, and it gets faster with every bug squashed.

const COLS = 4
const ROWS = 3
const LIVES = 3
const BEST_KEY = "magicwebs:bugs-best"

type Hole = { id: number; kind: "bug" | "feature"; until: number; ttl: number } | null
type Splat = { key: number; index: number; text: string; good: boolean; at: number }
type Phase = "ready" | "playing" | "paused" | "over"
type Game = {
  phase: Phase
  holes: Hole[]
  splats: Splat[]
  score: number
  best: number
  lives: number
  combo: number
  squashed: number
  nextSpawn: number
  pausedAt: number
  nextId: number
}

// Every step below takes a game and returns the next one, so React can run it twice safely.

function fresh(phase: Phase, best: number, now: number): Game {
  return {
    phase,
    holes: Array(COLS * ROWS).fill(null),
    splats: [],
    score: 0,
    best,
    lives: LIVES,
    combo: 0,
    squashed: 0,
    nextSpawn: now + 500,
    pausedAt: 0,
    nextId: 1,
  }
}

/** Put a bug (or now and then a feature) in an empty section, and set when the next one comes. */
function spawn(g: Game, now: number): Game {
  let holes = g.holes
  let nextId = g.nextId
  const empty = holes.flatMap((h, i) => (h ? [] : [i]))
  if (empty.length) {
    const index = empty[Math.floor(Math.random() * empty.length)]!
    const kind = g.squashed >= 4 && Math.random() < 0.22 ? "feature" : "bug"
    const ttl = kind === "feature" ? 1500 : Math.max(650, 1600 - g.squashed * 22)
    const id = nextId++
    holes = holes.map((h, i) => (i === index ? { id, kind, until: now + ttl, ttl } : h))
  }
  const gap = Math.max(360, 950 - g.squashed * 14)
  return { ...g, holes, nextId, nextSpawn: now + gap * (0.7 + Math.random() * 0.6) }
}

function withSplat(g: Game, index: number, text: string, good: boolean, now: number): Game {
  return { ...g, nextId: g.nextId + 1, splats: [...g.splats, { key: g.nextId, index, text, good, at: now }] }
}

function settle(g: Game): Game {
  if (g.lives > 0) return g
  return { ...g, phase: "over", holes: g.holes.map(() => null), best: Math.max(g.best, g.score) }
}

/** Bugs left too long get away and cost a life; a new one comes when it's due. */
function tick(g: Game, now: number): Game {
  if (g.phase !== "playing") return g
  let next: Game = { ...g, holes: g.holes.map((h) => (h && now >= h.until ? null : h)) }
  g.holes.forEach((h, index) => {
    if (h?.kind === "bug" && now >= h.until) next = withSplat({ ...next, lives: next.lives - 1, combo: 0 }, index, "Got away", false, now)
  })
  if (now >= next.nextSpawn) next = spawn(next, now)
  next = { ...next, splats: next.splats.filter((x) => now - x.at < 700) }
  return settle(next)
}

function hit(g: Game, index: number, now: number): Game {
  const h = g.holes[index]
  if (g.phase !== "playing" || !h) return g
  const holes = g.holes.map((x, i) => (i === index ? null : x))
  if (h.kind === "feature") {
    return settle(withSplat({ ...g, holes, lives: g.lives - 1, combo: 0 }, index, "Not a bug!", false, now))
  }
  const combo = g.combo + 1
  const gained = 10 * (1 + Math.floor(combo / 5))
  const score = g.score + gained
  return withSplat(
    { ...g, holes, combo, squashed: g.squashed + 1, score, best: Math.max(g.best, score) },
    index,
    combo >= 5 ? `+${gained} ×${combo}` : `+${gained}`,
    true,
    now,
  )
}

function pause(g: Game, now: number): Game {
  return g.phase === "playing" ? { ...g, phase: "paused", pausedAt: now } : g
}

/** Carry on where it stopped: every timer moves on by the time spent paused. */
function resume(g: Game, now: number): Game {
  if (g.phase !== "paused") return g
  const shift = now - g.pausedAt
  return {
    ...g,
    phase: "playing",
    holes: g.holes.map((h) => (h ? { ...h, until: h.until + shift } : h)),
    nextSpawn: g.nextSpawn + shift,
  }
}

const OVERLAY = cn(
  "absolute inset-0 z-[3] flex flex-col items-center justify-center gap-1.5 rounded-[inherit] bg-[#18181bd9] backdrop-blur-[4px] px-6",
  "text-white text-center animate-[mw-fade_0.3s_ease]",
)
const OVERLAY_BTN =
  "mt-2.5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 bg-white text-[#18181b] text-[14px] font-semibold [&_svg]:size-[15px]"

export function BugsGame() {
  const [g, setGame] = useState(() => fresh("ready", readBest(BEST_KEY), 0))
  const best = g.best
  const start = () => setGame((g) => fresh("playing", g.best, performance.now()))

  useEffect(() => {
    if (best > 0) saveBest(BEST_KEY, best)
  }, [best])

  const playing = g.phase === "playing"
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      const now = performance.now()
      setGame((g) => tick(g, now))
    }, 50)
    // A hidden tab would let every bug get away, so the game waits.
    const onVisibility = () => {
      if (!document.hidden) return
      const now = performance.now()
      setGame((g) => pause(g, now))
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [playing])

  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col gap-3.5 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-mw-subtle text-[13px] font-medium">Score</span>
          <span className="text-[28px] font-[650] tracking-[-0.04em] tabular-nums leading-none">{g.score}</span>
        </div>
        <div className="flex gap-0.5 [&_svg]:size-4" aria-label={`${g.lives} of ${LIVES} lives left`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <Heart
              key={i}
              aria-hidden="true"
              className={i < g.lives ? "fill-[#ff4d6d] text-[#ff4d6d]" : "text-mw-faint"}
            />
          ))}
        </div>
        <div className="ml-auto inline-flex items-center gap-[5px] rounded-full px-2.5 py-1 bg-white shadow-mw-chip text-mw-muted text-[13px] font-[550] tabular-nums [&_svg]:size-3.5 [&_svg]:text-[#ff9f0a]">
          <Trophy aria-hidden="true" />
          <span>Best {best}</span>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-full text-mw-muted transition-[background-color] duration-200 ease-mw-out hover:bg-[#8080801f] disabled:opacity-40 [&_svg]:size-4"
          onClick={g.phase === "playing" ? () => setGame((g) => pause(g, performance.now())) : start}
          disabled={g.phase === "ready"}
          aria-label={g.phase === "playing" ? "Pause" : "New game"}
        >
          {g.phase === "playing" ? <Pause /> : <RotateCcw />}
        </button>
      </div>

      <div
        className={cn(
          "relative flex flex-col overflow-hidden rounded-[18px] touch-none",
          "bg-[linear-gradient(160deg,#27272a,#18181b)] shadow-[inset_0_1px_#ffffff1a,0_0_0_1px_#00000014,0_20px_40px_-16px_#00000040]",
        )}
        data-paused={g.phase !== "playing" || undefined}
      >
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1 *:size-2 *:rounded-full *:bg-[#ffffff26]" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div
          className="grid aspect-[4/3] gap-1.5 p-2 pt-1"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}
          role="group"
          aria-label="Page sections. Tap the bugs; leave the sparkly features alone."
        >
          {g.holes.map((h, index) => (
            <button
              key={index}
              type="button"
              tabIndex={-1}
              className="relative grid place-items-center overflow-hidden rounded-[10px] bg-[#ffffff0d] shadow-[inset_0_0_0_1px_#ffffff08]"
              onPointerDown={(e) => {
                e.preventDefault()
                const now = performance.now()
                setGame((g) => hit(g, index, now))
              }}
              aria-label={h ? (h.kind === "bug" ? "Bug" : "Feature") : "Empty section"}
            >
              {/* Faint lines, so each cell reads as a section of a page. */}
              <span className="absolute top-2.5 left-2.5 flex w-1/2 flex-col gap-1 *:h-1 *:rounded-full *:bg-[#ffffff12]" aria-hidden="true">
                <i />
                <i className="w-2/3" />
              </span>
              {h && (
                <span
                  key={h.id}
                  className={cn(
                    "relative grid size-[62%] max-w-14 place-items-center rounded-full animate-[mw-badge_0.18s_var(--ease-mw-out)] [&_svg]:size-[55%]",
                    h.kind === "bug"
                      ? "bg-[linear-gradient(160deg,#ff7a8f,#e1324f)] text-white shadow-[inset_0_1px_#ffffff59,0_4px_12px_-2px_#ff4d6d80]"
                      : "bg-[linear-gradient(160deg,#3ee0a5,#0a9a66)] text-white shadow-[inset_0_1px_#ffffff59,0_4px_12px_-2px_#0dbf7f80]",
                  )}
                >
                  {h.kind === "bug" ? <Bug /> : <Sparkles />}
                </span>
              )}
              {h && (
                <span
                  key={`bar-${h.id}`}
                  className={cn(
                    "absolute inset-x-2 bottom-1.5 h-[3px] origin-left rounded-full animate-[mw-drain_linear_forwards]",
                    "[[data-paused]_&]:[animation-play-state:paused]",
                    h.kind === "bug" ? "bg-[#ff4d6d]" : "bg-[#0dbf7f]",
                  )}
                  style={{ animationDuration: `${h.ttl}ms` }}
                  aria-hidden="true"
                />
              )}
              {g.splats
                .filter((s) => s.index === index)
                .map((s) => (
                  <span
                    key={s.key}
                    className={cn(
                      "absolute z-[2] rounded-full px-2 py-0.5 text-[12px] font-bold whitespace-nowrap pointer-events-none",
                      "animate-[mw-toast_0.7s_var(--ease-mw-out)_forwards]",
                      s.good ? "bg-white text-[#18181b]" : "bg-[#ff4d6d] text-white",
                    )}
                  >
                    {s.text}
                  </span>
                ))}
            </button>
          ))}
        </div>

        {g.phase === "ready" && (
          <div className={OVERLAY}>
            <p className="text-[22px] font-[650] tracking-[-0.03em]">Bug Squash</p>
            <p className="text-[#ffffffb3] text-[14px]">Tap the bugs before they get away. Leave the features alone.</p>
            <button type="button" className={OVERLAY_BTN} onClick={start}>
              <Play />
              Start
            </button>
          </div>
        )}
        {g.phase === "paused" && (
          <div className={OVERLAY}>
            <p className="text-[22px] font-[650] tracking-[-0.03em]">Paused</p>
            <button type="button" className={OVERLAY_BTN} onClick={() => setGame((g) => resume(g, performance.now()))}>
              <Play />
              Resume
            </button>
          </div>
        )}
        {g.phase === "over" && (
          <div className={OVERLAY}>
            <p className="text-[22px] font-[650] tracking-[-0.03em]">Out of lives</p>
            <p className="text-[#ffffffb3] text-[14px]">
              {g.squashed} {g.squashed === 1 ? "bug" : "bugs"} squashed · {g.score} points
              {g.score >= best && g.score > 0 ? " · new best!" : ""}
            </p>
            <button type="button" className={OVERLAY_BTN} onClick={start}>
              <RotateCcw />
              Play again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
