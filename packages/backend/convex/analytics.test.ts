import { describe, expect, test } from "bun:test"

import { describeAgent, summarise } from "./analytics"

describe("describeAgent", () => {
  test("reads common browsers", () => {
    expect(
      describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
    ).toEqual({ device: "desktop", browser: "Chrome", os: "Windows" })
    expect(
      describeAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"),
    ).toEqual({ device: "mobile", browser: "Safari", os: "iOS" })
    expect(
      describeAgent("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Safari/537.36"),
    ).toEqual({ device: "tablet", browser: "Samsung Internet", os: "Android" })
  })

  test("drops bots", () => {
    expect(describeAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBeNull()
    expect(describeAgent("")).toBeNull()
  })
})

describe("summarise", () => {
  const view = (visitor: string, path: string, extra: Partial<Parameters<typeof summarise>[0][number]> = {}) => ({
    visitor,
    path,
    device: "desktop" as const,
    browser: "Chrome",
    os: "Windows",
    ...extra,
  })

  test("counts visitors, bounces, time and sources", () => {
    const day = summarise([
      view("a", "/", { referrer: "google.com", duration: 30_000, country: "IN" }),
      view("a", "/pricing", { duration: 10_000, country: "IN" }),
      view("b", "/", { utmSource: "newsletter", country: "GB" }),
    ])
    expect(day.visitors).toBe(2)
    expect(day.pageviews).toBe(3)
    expect(day.bounces).toBe(1)
    expect(day.durationMs).toBe(40_000)
    expect(day.timedViews).toBe(2)
    expect(day.pages[0]).toEqual({ key: "/", views: 2, visitors: 2 })
    expect(day.referrers).toEqual([
      { key: "Direct", count: 2 },
      { key: "google.com", count: 1 },
    ])
    expect(day.sources).toEqual([{ key: "newsletter", count: 1 }])
    expect(day.countries[0]).toEqual({ key: "IN", count: 2 })
  })
})
