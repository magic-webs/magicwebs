// Generate the shared secrets the apps use and write them where they belong:
//   WORKER_SECRET -> apps/crawler/.env and the Convex environment
//   MCP_API_KEY   -> apps/api/.env
//
// Usage: bun scripts/generate-secrets.ts [--force] [--skip-convex]
// Existing values are kept unless --force is passed.

import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const force = process.argv.includes("--force")
const skipConvex = process.argv.includes("--skip-convex")

function secret(): string {
  return randomBytes(32).toString("base64url")
}

function readEnv(file: string): string {
  if (existsSync(file)) return readFileSync(file, "utf8")
  const example = `${file}.example`
  return existsSync(example) ? readFileSync(example, "utf8") : ""
}

/** Returns the value now stored for `name`, writing `value` unless one is already set. */
function upsert(file: string, name: string, value: string): string {
  let text = readEnv(file)
  const line = new RegExp(`^${name}=(.*)$`, "m")
  const current = text.match(line)?.[1]?.trim()
  if (current && !force) {
    console.log(`  ${name} already set in ${file}, keeping it`)
    return current
  }
  text = line.test(text)
    ? text.replace(line, `${name}=${value}`)
    : `${text.replace(/\n?$/, "\n")}${name}=${value}\n`
  writeFileSync(file, text)
  console.log(`  ${name} written to ${file}`)
  return value
}

const workerSecret = upsert(join(root, "apps/crawler/.env"), "WORKER_SECRET", secret())
upsert(join(root, "apps/api/.env"), "MCP_API_KEY", secret())

if (skipConvex) {
  console.log("Skipped Convex. Run in packages/backend: bunx convex env set WORKER_SECRET <value from apps/crawler/.env>")
} else {
  const proc = Bun.spawnSync(["bunx", "convex", "env", "set", "WORKER_SECRET", workerSecret], {
    cwd: join(root, "packages/backend"),
    stdout: "inherit",
    stderr: "inherit",
  })
  if (proc.exitCode !== 0) {
    console.error("Failed to set WORKER_SECRET in Convex. Is `convex dev` configured in packages/backend?")
    process.exit(1)
  }
  console.log("  WORKER_SECRET set in the Convex environment")
}
