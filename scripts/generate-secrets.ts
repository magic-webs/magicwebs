// Generate the secrets the apps use and write them where they belong:
//   WORKER_SECRET          -> apps/crawler/.env and the Convex environment
//   JWT_PRIVATE_KEY, JWKS  -> the Convex environment (Convex Auth signs sessions with them)
//
// MCP clients authenticate with personal API keys made on the dashboard, so
// there is no shared MCP key any more.
//
// Usage: bun scripts/generate-secrets.ts [--force] [--skip-convex]
// Existing values are kept unless --force is passed.

import { generateKeyPairSync, randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const backend = join(root, "packages/backend")
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

function convex(...args: string[]) {
  // "get" reports a missing variable on stderr; that's expected here, so stderr is kept quiet.
  return Bun.spawnSync(["bunx", "convex", "env", ...args], { cwd: backend, stdout: "pipe", stderr: "pipe" })
}

/** Set a Convex environment variable unless it already has a value. */
function setConvex(name: string, value: string) {
  if (!force && convex("get", name).stdout.toString().trim()) {
    console.log(`  ${name} already set in Convex, keeping it`)
    return
  }
  // NAME=VALUE form: the private key starts with "-----", which the CLI would read as a flag.
  const result = convex("set", `${name}=${value}`)
  if (result.exitCode !== 0) {
    console.error(result.stderr.toString())
    console.error(`Failed to set ${name} in Convex. Is \`convex dev\` configured in packages/backend?`)
    process.exit(1)
  }
  console.log(`  ${name} set in the Convex environment`)
}

/** RS256 key pair for Convex Auth, in the formats it reads. */
function authKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const jwk = publicKey.export({ format: "jwk" })
  return {
    JWT_PRIVATE_KEY: pem.trimEnd().replace(/\n/g, " "),
    JWKS: JSON.stringify({ keys: [{ use: "sig", alg: "RS256", ...jwk }] }),
  }
}

const workerSecret = upsert(join(root, "apps/crawler/.env"), "WORKER_SECRET", secret())

if (skipConvex) {
  console.log("Skipped Convex. Run in packages/backend: bunx convex env set WORKER_SECRET <value from apps/crawler/.env>")
  console.log("and set JWT_PRIVATE_KEY and JWKS for Convex Auth (rerun without --skip-convex to generate them).")
} else {
  setConvex("WORKER_SECRET", workerSecret)
  const keys = authKeys()
  // The pair only works together, so replace both or neither.
  if (!force && convex("get", "JWT_PRIVATE_KEY").stdout.toString().trim()) {
    console.log("  JWT_PRIVATE_KEY already set in Convex, keeping it and JWKS")
  } else {
    setConvex("JWT_PRIVATE_KEY", keys.JWT_PRIVATE_KEY)
    setConvex("JWKS", keys.JWKS)
  }
}
