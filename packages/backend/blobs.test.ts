import { expect, test } from "bun:test"

import { emptyPageDoc, type PageDoc } from "@magicwebs/page-schema"

import { loadDoc, storeDoc } from "./convex/lib"

// A minimal in-memory stand-in for the blobs table.
function fakeCtx() {
  const rows: { hash: string; index: number; data: string }[] = []
  const query = () => ({
    withIndex: (_: string, f: (q: { eq: (k: string, v: string) => unknown }) => unknown) => {
      let hash = ""
      f({ eq: (_k, v) => ((hash = v), {}) })
      const found = rows.filter((r) => r.hash === hash)
      return { first: async () => found[0] ?? null, collect: async () => found }
    },
  })
  return { rows, ctx: { db: { query, insert: async (_t: string, row: (typeof rows)[number]) => rows.push(row) } } as never }
}

test("long strings round-trip through chunked, deduplicated blobs", async () => {
  const { rows, ctx } = fakeCtx()
  const big = "<div>é漢</div>".repeat(80_000) // ~1 MB, multi-byte
  const doc: PageDoc = {
    ...emptyPageDoc("Big"),
    styles: { css: "a{}".repeat(30_000) },
    sections: [{ id: "s1", type: "html", props: { html: big } }, { id: "s2", type: "html", props: { html: big } }],
  }
  const stored = (await storeDoc(ctx, doc)) as { sections: { props: { html: unknown } }[] }
  // Convex rejects field names starting with "$" or "_".
  expect(JSON.stringify(stored)).not.toMatch(/"[$_][^"]*":/)
  expect(stored.sections[0].props.html).toEqual(stored.sections[1].props.html)
  expect(JSON.stringify(stored).length).toBeLessThan(5000)
  expect(rows.every((r) => r.data.length <= 300_000)).toBe(true)
  expect(new Set(rows.map((r) => r.hash)).size).toBe(2)
  expect(await loadDoc(ctx, stored)).toEqual(doc)
  // Storing again writes nothing new.
  const before = rows.length
  await storeDoc(ctx, doc)
  expect(rows.length).toBe(before)
  // Old drafts without blobs still load.
  expect(await loadDoc(ctx, emptyPageDoc("Old"))).toEqual(emptyPageDoc("Old"))
})
