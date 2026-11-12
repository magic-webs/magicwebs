"use client"

import { Gamepad2 } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

import { BlocksGame } from "./blocks-game"
import { BugsGame } from "./bugs-game"
import { WordsGame } from "./words-game"

const GAMES = [
  { id: "blocks", label: "Blocks", hint: "Fill a row or column to clear it" },
  { id: "bugs", label: "Bug Squash", hint: "Tap the bugs, spare the features" },
  { id: "words", label: "Unscramble", hint: "Spell words from your site" },
] as const

type GameId = (typeof GAMES)[number]["id"]

const PICK_KEY = "magicwebs:game"

function readPick(): GameId {
  try {
    const saved = localStorage.getItem(PICK_KEY)
    return GAMES.some((g) => g.id === saved) ? (saved as GameId) : "blocks"
  } catch {
    return "blocks"
  }
}

/**
 * The games to play while a site builds, with tabs to switch between them; the
 * last one played is remembered. `sources` is the site's own text (name,
 * address, page titles) that Unscramble takes its words from.
 *
 * Renders the tabs and then the game as siblings, so a parent can size the game as its last child.
 */
export function Games({ sources }: { sources: readonly string[] }) {
  const [pick, setPick] = useState<GameId>(readPick)
  const game = GAMES.find((g) => g.id === pick)!

  function choose(id: GameId) {
    setPick(id)
    try {
      localStorage.setItem(PICK_KEY, id)
    } catch {
      // The choice just won't survive a reload.
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Gamepad2 className="size-[18px] text-mw-accent" aria-hidden="true" />
        <div className="flex gap-0.5 rounded-[10px] p-0.5 bg-mw-sunk" role="tablist" aria-label="Games">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === pick}
              className={cn(
                "h-7 rounded-[8px] px-2.5 text-mw-subtle text-[13px] font-semibold transition-[color] duration-200 ease-mw-out",
                "hover:text-mw-fg aria-selected:bg-white aria-selected:shadow-mw-chip aria-selected:text-mw-fg",
              )}
              onClick={() => choose(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-mw-subtle text-[13px]">{game.hint}</span>
      </div>
      {pick === "blocks" ? <BlocksGame /> : pick === "bugs" ? <BugsGame /> : <WordsGame sources={sources} />}
    </>
  )
}
