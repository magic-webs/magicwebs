import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

// The platform UI is apps/web inside a Bun workspace; shared code lives in
// packages/ at the workspace root.
const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const nextConfig: NextConfig = {
  turbopack: { root: workspaceRoot },
  transpilePackages: ["@magicwebs/page-schema", "@magicwebs/renderer"],
}

export default nextConfig
