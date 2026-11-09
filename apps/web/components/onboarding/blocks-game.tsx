"use client"

import { RotateCcw, Trophy } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

// A block puzzle to pass the time while a site builds: drag pieces onto an
// 8×8 board, fill a row or a column to clear it, and keep going until none of
// the three pieces in the tray fits.

const SIZE = 8
const BEST_KEY = "magicwebs:blocks-best"

type Cell = readonly [row: number, col: number]
type Piece = { id: number; cells: Cell[]; color: string; rows: number; cols: number }
type Board = (string | null)[]
type Burst = { key: string; index: number; color: string }
type Drag = { piece: Piece; slot: number; x: number; y: number; cell: number; lift: number; at: { row: number; col: number } | null; moved: boolean; startX: number; startY: number }

const COLORS = ["#2f7cff", "#ff9f0a", "#0dbf7f", "#ff4d6d", "#14b8c4", "#f5c518"]

const SHAPES: Cell[][] = [
  [[0, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 0]],
  [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 1], [1, 1], [2, 1], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  [[0, 1], [1, 0], [1, 1], [1, 2]],
  [[0, 1], [0, 2], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [1, 1], [2, 2]],
]

let nextId = 1

/** Must match the board's padding (p-2 in BOARD) and the cell gap (--cell-gap in GAME) below. */
const BOARD_PAD = 8
const GAP = 4

// ---------- Classes ----------

/** --cell-gap is the board's gap, and the gap of a piece being dragged so it lines up with the board. */
const GAME = "[--cell-gap:4px] mx-auto flex w-full max-w-[400px] flex-col gap-3.5 select-none"
const BOARD = cn(
  "relative grid aspect-square grid-cols-[repeat(8,1fr)] gap-[var(--cell-gap)] rounded-[18px] p-2 touch-none",
  "bg-[linear-gradient(160deg,#27272a,#18181b)] shadow-[inset_0_1px_#ffffff1a,0_0_0_1px_#00000014,0_20px_40px_-16px_#00000040]",
)
/** A filled block, coloured by --block. */
const FILLED_BG = "[background:linear-gradient(160deg,color-mix(in_srgb,var(--block)_78%,#fff),var(--block)_55%)]"
const FILLED_SHADOW = "shadow-[inset_0_1px_#ffffff59,inset_0_-2px_#0000002e,0_1px_2px_#00000033]"
const CELL = cn(
  "rounded-[6px] bg-[#ffffff0d] shadow-[inset_0_0_0_1px_#ffffff08] transition-[background-color] duration-[120ms] ease-[ease]",
  "data-filled:[background:linear-gradient(160deg,color-mix(in_srgb,var(--block)_78%,#fff),var(--block)_55%)]",
  "data-filled:shadow-[inset_0_1px_#ffffff59,inset_0_-2px_#0000002e,0_1px_2px_#00000033]",
  "[&[data-ghost]:not([data-filled])]:[background:color-mix(in_srgb,var(--block)_45%,transparent)]",
  "[&[data-ghost]:not([data-filled])]:shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--block)_85%,#fff)]",
  "[&[data-clears][data-filled]]:animate-[mw-glow_0.7s_ease-in-out_infinite_alternate]",
)
const BLOCK = cn("block rounded-[22%]", FILLED_BG, FILLED_SHADOW)

/** The board's inner box and the distance from one cell to the next. */
function metrics(board: HTMLElement | null) {
  const rect = board?.getBoundingClientRect()
  if (!rect) return null
  const pitch = (rect.width - BOARD_PAD * 2 + GAP) / SIZE
  return { left: rect.left + BOARD_PAD, top: rect.top + BOARD_PAD, pitch }
}

function randomPiece(): Piece {
  const cells = SHAPES[Math.floor(Math.random() * SHAPES.length)]!
  return {
    id: nextId++,
    cells,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    rows: Math.max(...cells.map(([r]) => r)) + 1,
    cols: Math.max(...cells.map(([, c]) => c)) + 1,
  }
}

const newTray = () => [randomPiece(), randomPiece(), randomPiece()]

function fits(board: Board, piece: Piece, row: number, col: number): boolean {
  return piece.cells.every(([r, c]) => {
    const rr = row + r
    const cc = col + c
    return rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && !board[rr * SIZE + cc]
  })
}

function canPlaceAnywhere(board: Board, piece: Piece): boolean {
  for (let row = 0; row <= SIZE - piece.rows; row++) {
    for (let col = 0; col <= SIZE - piece.cols; col++) if (fits(board, piece, row, col)) return true
  }
  return false
}

/** Place a piece and clear every full row and column; returns the new board, the cleared cells and the lines cleared. */
function place(board: Board, piece: Piece, row: number, col: number) {
  const next = [...board]
  for (const [r, c] of piece.cells) next[(row + r) * SIZE + col + c] = piece.color
  const cleared = new Set<number>()
  let lines = 0
  for (let r = 0; r < SIZE; r++) {
    const cells = Array.from({ length: SIZE }, (_, c) => r * SIZE + c)
    if (cells.every((i) => next[i])) {
      lines++
      cells.forEach((i) => cleared.add(i))
    }
  }
  for (let c = 0; c < SIZE; c++) {
    const cells = Array.from({ length: SIZE }, (_, r) => r * SIZE + c)
    if (cells.every((i) => next[i])) {
      lines++
      cells.forEach((i) => cleared.add(i))
    }
  }
  const bursts = [...cleared].map((index) => ({ index, color: next[index]! }))
  for (const i of cleared) next[i] = null
  return { board: next, bursts, lines }
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function PieceShape({ piece, unit, dimmed, floating }: { piece: Piece; unit: string; dimmed?: boolean; floating?: boolean }) {
  return (
    <span
      className={cn(
        "grid data-dimmed:opacity-35 data-dimmed:[filter:grayscale(0.7)]",
        floating ? "gap-[var(--cell-gap)]" : "gap-[3px]",
      )}
      data-dimmed={dimmed || undefined}
      style={{
        gridTemplateColumns: `repeat(${piece.cols}, ${unit})`,
        gridTemplateRows: `repeat(${piece.rows}, ${unit})`,
      }}
    >
      {piece.cells.map(([r, c]) => (
        <span
          key={`${r}-${c}`}
          className={BLOCK}
          style={{ gridRow: r + 1, gridColumn: c + 1, "--block": piece.color } as React.CSSProperties}
        />
      ))}
    </span>
  )
}

export function BlocksGame() {
  const [board, setBoard] = useState<Board>(() => Array(SIZE * SIZE).fill(null))
  const [tray, setTray] = useState<(Piece | null)[]>(newTray)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(readBest)
  const [streak, setStreak] = useState(0)
  const [bursts, setBursts] = useState<Burst[]>([])
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const gameOver = tray.every((p) => !p || !canPlaceAnywhere(board, p)) && tray.some(Boolean)

  /** The board cell a piece's top-left would land on with its centre at (x, y). */
  const cellAt = useCallback((piece: Piece, x: number, y: number) => {
    const m = metrics(boardRef.current)
    if (!m) return null
    const col = Math.round((x - m.left - (piece.cols * m.pitch - GAP) / 2) / m.pitch)
    const row = Math.round((y - m.top - (piece.rows * m.pitch - GAP) / 2) / m.pitch)
    return { row, col }
  }, [])

  const commit = useCallback(
    (slot: number, row: number, col: number) => {
      const piece = tray[slot]
      if (!piece || !fits(board, piece, row, col)) return false
      const result = place(board, piece, row, col)
      const nextStreak = result.lines ? streak + 1 : 0
      const gained = piece.cells.length + result.lines * 10 * result.lines + (result.lines && streak ? streak * 5 : 0)
      const nextScore = score + gained
      setBoard(result.board)
      setStreak(nextStreak)
      setScore(nextScore)
      if (nextScore > best) {
        setBest(nextScore)
        try {
          localStorage.setItem(BEST_KEY, String(nextScore))
        } catch {
          // Storage may be blocked; the best score just won't survive a reload.
        }
      }
      if (result.lines) {
        const stamp = Date.now()
        setBursts((all) => [...all, ...result.bursts.map((b) => ({ ...b, key: `${stamp}-${b.index}` }))])
        setTimeout(() => setBursts((all) => all.filter((b) => !b.key.startsWith(`${stamp}-`))), 520)
        const text = result.lines > 1 ? `${result.lines} lines! +${gained}` : nextStreak > 1 ? `Streak ×${nextStreak} +${gained}` : `Clear! +${gained}`
        setToast({ key: stamp, text })
      }
      const rest = tray.map((p, i) => (i === slot ? null : p))
      setTray(rest.every((p) => !p) ? newTray() : rest)
      setSelected(null)
      setHover(null)
      return true
    },
    [board, tray, score, best, streak],
  )

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1100)
    return () => clearTimeout(t)
  }, [toast])

  // Dragging: the piece follows the pointer at board scale, lifted above a finger so it stays visible.
  // The handlers read the drag from here so a pointer-up never sees a stale one.
  const dragRef = useRef<Drag | null>(null)
  const dragging = drag !== null

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6
      const next = { ...d, x: e.clientX, y: e.clientY, moved, at: cellAt(d.piece, e.clientX, e.clientY - d.lift) }
      dragRef.current = next
      setDrag(next)
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      if (!d.moved) {
        setSelected((cur) => (cur === d.slot ? null : d.slot))
        return
      }
      const at = cellAt(d.piece, e.clientX, e.clientY - d.lift)
      if (at) commit(d.slot, at.row, at.col)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [dragging, cellAt, commit])

  function startDrag(e: React.PointerEvent, slot: number) {
    const piece = tray[slot]
    if (!piece || gameOver) return
    e.preventDefault()
    const cell = metrics(boardRef.current)?.pitch ?? 36
    const lift = e.pointerType === "mouse" ? 0 : cell * (piece.rows / 2 + 1.2)
    const next = { piece, slot, x: e.clientX, y: e.clientY, cell, lift, at: null, moved: false, startX: e.clientX, startY: e.clientY }
    dragRef.current = next
    setDrag(next)
  }

  function restart() {
    setBoard(Array(SIZE * SIZE).fill(null))
    setTray(newTray())
    setScore(0)
    setStreak(0)
    setSelected(null)
    setHover(null)
  }

  // Where the dragged (or tapped-then-hovered) piece would go, to preview it on the board.
  let ghost: { piece: Piece; row: number; col: number; ok: boolean } | null = null
  if (drag?.moved) {
    const at = drag.at
    if (at) ghost = { piece: drag.piece, ...at, ok: fits(board, drag.piece, at.row, at.col) }
  } else if (selected !== null && hover && tray[selected]) {
    const piece = tray[selected]!
    ghost = { piece, row: hover.row, col: hover.col, ok: fits(board, piece, hover.row, hover.col) }
  }
  const ghostCells = new Set<number>()
  const ghostClears = new Set<number>()
  if (ghost?.ok) {
    for (const [r, c] of ghost.piece.cells) ghostCells.add((ghost.row + r) * SIZE + ghost.col + c)
    const filled = (i: number) => Boolean(board[i]) || ghostCells.has(i)
    for (let r = 0; r < SIZE; r++) {
      const cells = Array.from({ length: SIZE }, (_, c) => r * SIZE + c)
      if (cells.every(filled)) cells.forEach((i) => ghostClears.add(i))
    }
    for (let c = 0; c < SIZE; c++) {
      const cells = Array.from({ length: SIZE }, (_, r) => r * SIZE + c)
      if (cells.every(filled)) cells.forEach((i) => ghostClears.add(i))
    }
  }

  function boardCell(e: React.PointerEvent | React.MouseEvent) {
    const m = metrics(boardRef.current)
    if (!m) return null
    return { row: Math.floor((e.clientY - m.top) / m.pitch), col: Math.floor((e.clientX - m.left) / m.pitch) }
  }

  return (
    <div className={GAME}>
      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-mw-subtle text-[13px] font-medium">Score</span>
          <span className="text-[28px] font-[650] tracking-[-0.04em] tabular-nums leading-none">{score}</span>
        </div>
        <div className="ml-auto inline-flex items-center gap-[5px] rounded-full px-2.5 py-1 bg-white shadow-mw-chip text-mw-muted text-[13px] font-[550] tabular-nums [&_svg]:size-3.5 [&_svg]:text-[#ff9f0a]">
          <Trophy aria-hidden="true" />
          <span>Best {best}</span>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-full text-mw-muted transition-[background-color] duration-200 ease-mw-out hover:bg-[#8080801f] [&_svg]:size-4"
          onClick={restart} aria-label="New game">
          <RotateCcw />
        </button>
      </div>

      <div
        ref={boardRef}
        className={BOARD}
        role="grid"
        aria-label="Puzzle board. Drag a piece here, or tap a piece then tap where its top-left block goes."
        onPointerMove={(e) => {
          if (selected === null || e.pointerType !== "mouse") return
          setHover(boardCell(e))
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          if (selected === null) return
          const at = boardCell(e)
          if (at) commit(selected, at.row, at.col)
        }}
      >
        {board.map((color, i) => (
          <span
            key={i}
            className={CELL}
            data-filled={color ? "" : undefined}
            data-ghost={ghostCells.has(i) ? "" : undefined}
            data-clears={ghostClears.has(i) ? "" : undefined}
            style={
              {
                "--block": color ?? (ghostCells.has(i) ? ghost?.piece.color : undefined),
              } as React.CSSProperties
            }
          />
        ))}
        {bursts.map((b) => (
          <span
            key={b.key}
            className="absolute w-[calc((100%_-_12px)/8_-_4px)] aspect-square rounded-[6px] [background:var(--block)] pointer-events-none animate-[mw-burst_0.5s_cubic-bezier(0.2,0.7,0.3,1)_forwards]"
            style={
              {
                "--block": b.color,
                left: `calc(${BOARD_PAD}px + ${b.index % SIZE} * (100% - ${BOARD_PAD * 2 - GAP}px) / ${SIZE})`,
                top: `calc(${BOARD_PAD}px + ${Math.floor(b.index / SIZE)} * (100% - ${BOARD_PAD * 2 - GAP}px) / ${SIZE})`,
              } as React.CSSProperties
            }
          />
        ))}
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
        {gameOver && (
          <div
            className={cn(
              "absolute inset-0 z-[3] flex flex-col items-center justify-center gap-1.5 rounded-[inherit] bg-[#18181bd9] backdrop-blur-[4px]",
              "text-white text-center animate-[mw-fade_0.3s_ease]",
            )}
          >
            <p className="text-[22px] font-[650] tracking-[-0.03em]">No moves left</p>
            <p className="text-[#ffffffb3] text-[14px]">
              You scored {score}
              {score >= best && score > 0 ? " · new best!" : ""}
            </p>
            <button
              type="button"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 bg-white text-[#18181b] text-[14px] font-semibold [&_svg]:size-[15px]"
              onClick={restart}>
              <RotateCcw />
              Play again
            </button>
          </div>
        )}
      </div>

      <div className="grid min-h-28 grid-cols-[repeat(3,1fr)] gap-2.5">
        {tray.map((piece, slot) => (
          <div key={piece?.id ?? `empty-${slot}`} className="grid place-items-center rounded-[16px] bg-mw-sunk">
            {piece && (
              <button
                type="button"
                className={cn(
                  "grid size-full min-h-28 place-items-center rounded-[16px] cursor-grab touch-none",
                  "transition-[transform,box-shadow] duration-200 ease-mw-out hover:[transform:translateY(-2px)]",
                  "data-[selected]:shadow-[inset_0_0_0_2px_#18181b] data-dragging:opacity-25",
                )}
                data-selected={selected === slot || undefined}
                data-dragging={drag?.slot === slot && drag.moved ? "" : undefined}
                aria-label={`Piece of ${piece.cells.length} block${piece.cells.length === 1 ? "" : "s"}`}
                aria-pressed={selected === slot}
                onPointerDown={(e) => startDrag(e, slot)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setSelected((cur) => (cur === slot ? null : slot))
                  }
                }}
              >
                <PieceShape piece={piece} unit="clamp(12px, 3.4vw, 18px)" dimmed={!canPlaceAnywhere(board, piece)} />
              </button>
            )}
          </div>
        ))}
      </div>

      {drag?.moved && (
        <div
          className="fixed z-[100] pointer-events-none drop-shadow-[0_14px_18px_#00000040]"
          style={{
            left: drag.x - (drag.piece.cols * drag.cell - GAP) / 2,
            top: drag.y - drag.lift - (drag.piece.rows * drag.cell - GAP) / 2,
          }}
          aria-hidden="true"
        >
          <PieceShape piece={drag.piece} unit={`${drag.cell - GAP}px`} floating />
        </div>
      )}
    </div>
  )
}
