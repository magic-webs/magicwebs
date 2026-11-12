/** A game's best score, kept in this browser. Storage may be blocked; then the best just won't survive a reload. */
export function readBest(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0
  } catch {
    return 0
  }
}

export function saveBest(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // See above.
  }
}
