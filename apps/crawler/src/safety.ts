import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

// Users choose which URLs we crawl, so the crawler must never be pointed at
// the VPS itself, the cloud metadata service or the private network.

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isPrivateIP(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip)
  const v6 = ip.toLowerCase()
  if (v6.startsWith("::ffff:")) return isPrivateIPv4(v6.slice(7))
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")
}

const verdicts = new Map<string, Promise<boolean>>()

/** True when every address the URL's host resolves to is publicly routable. */
export function isPublicUrl(raw: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return Promise.resolve(false)
  }
  if (url.protocol === "data:" || url.protocol === "blob:") return Promise.resolve(true)
  if (url.protocol !== "http:" && url.protocol !== "https:") return Promise.resolve(false)

  const host = url.hostname.replace(/^\[|\]$/g, "")
  let verdict = verdicts.get(host)
  if (!verdict) {
    verdict = (async () => {
      if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false
      if (isIP(host)) return !isPrivateIP(host)
      try {
        const addresses = await lookup(host, { all: true })
        return addresses.length > 0 && addresses.every((a) => !isPrivateIP(a.address))
      } catch {
        return false
      }
    })()
    verdicts.set(host, verdict)
  }
  return verdict
}
