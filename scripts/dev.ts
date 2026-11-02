// Run every dev server at once, with each line prefixed by the service name.
//
// Usage: bun scripts/dev.ts [service...]
//   bun run dev              -> backend, web, api, crawler, edge
//   bun run dev web api      -> only those
// Ctrl+C stops everything; if one service exits, the rest are stopped too.

import { join } from "node:path"

const root = join(import.meta.dir, "..")

const services = {
  backend: { script: "dev:backend", color: 35 },
  web: { script: "dev:web", color: 36 },
  api: { script: "dev:api", color: 32 },
  crawler: { script: "dev:crawler", color: 33 },
  edge: { script: "dev:edge", color: 34 },
} as const

type Name = keyof typeof services

const requested = process.argv.slice(2)
const unknown = requested.filter((name) => !(name in services))
if (unknown.length) {
  console.error(`Unknown service: ${unknown.join(", ")}. Choose from: ${Object.keys(services).join(", ")}`)
  process.exit(1)
}
const names = (requested.length ? requested : Object.keys(services)) as Name[]
const width = Math.max(...names.map((name) => name.length))

function prefix(name: Name): string {
  return `\x1b[${services[name].color}m${name.padEnd(width)} |\x1b[0m `
}

async function pipe(name: Name, stream: ReadableStream<Uint8Array>, out: NodeJS.WriteStream) {
  const decoder = new TextDecoder()
  let buffered = ""
  for await (const chunk of stream) {
    buffered += decoder.decode(chunk, { stream: true })
    const lines = buffered.split(/\r?\n/)
    buffered = lines.pop() ?? ""
    for (const line of lines) out.write(prefix(name) + line + "\n")
  }
  if (buffered) out.write(prefix(name) + buffered + "\n")
}

const procs = names.map((name) => {
  const proc = Bun.spawn(["bun", "run", services[name].script], {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "1" },
  })
  pipe(name, proc.stdout, process.stdout)
  pipe(name, proc.stderr, process.stderr)
  return { name, proc }
})

let stopping = false

function stopAll(code: number) {
  if (stopping) return
  stopping = true
  for (const { proc } of procs) {
    if (proc.exitCode !== null) continue
    // On Windows, kill() leaves grandchildren (next, wrangler, convex) running.
    if (process.platform === "win32") {
      Bun.spawnSync(["taskkill", "/pid", String(proc.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" })
    } else {
      proc.kill("SIGTERM")
    }
  }
  Promise.all(procs.map(({ proc }) => proc.exited)).then(() => process.exit(code))
}

process.on("SIGINT", () => stopAll(0))
process.on("SIGTERM", () => stopAll(0))

for (const { name, proc } of procs) {
  proc.exited.then((code) => {
    if (stopping) return
    console.error(`${prefix(name)}exited with code ${code}, stopping the others`)
    stopAll(code || 1)
  })
}
