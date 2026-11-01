// Thin client for the Cloudflare REST endpoints the platform needs: Workers KV
// (published sites and hostname routing) and Cloudflare for SaaS (custom
// hostnames). Only imported from actions.

type CloudflareResponse<T> = {
  success: boolean
  errors: { message: string }[]
  result: T
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set in the Convex environment`)
  return value
}

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env("CLOUDFLARE_API_TOKEN")}`, ...init.headers },
  })
  if (response.status === 404 && init.method === "DELETE") return undefined as T
  const body = (await response.json()) as CloudflareResponse<T>
  if (!body.success) {
    throw new Error(`Cloudflare API error: ${body.errors.map((e) => e.message).join("; ")}`)
  }
  return body.result
}

function kvPath(key: string) {
  return `/accounts/${env("CLOUDFLARE_ACCOUNT_ID")}/storage/kv/namespaces/${env("CLOUDFLARE_KV_NAMESPACE_ID")}/values/${encodeURIComponent(key)}`
}

export async function kvPut(key: string, value: string) {
  await cf(kvPath(key), { method: "PUT", body: value, headers: { "Content-Type": "text/plain" } })
}

export async function kvDelete(key: string) {
  await cf(kvPath(key), { method: "DELETE" })
}

export type CustomHostname = {
  id: string
  hostname: string
  status: string
  ssl: { status: string; txt_name?: string; txt_value?: string; validation_records?: unknown[] }
  ownership_verification?: { type: string; name: string; value: string }
  verification_errors?: string[]
}

export async function createCustomHostname(hostname: string) {
  return cf<CustomHostname>(`/zones/${env("CLOUDFLARE_ZONE_ID")}/custom_hostnames`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostname, ssl: { method: "txt", type: "dv" } }),
  })
}

export async function getCustomHostname(id: string) {
  return cf<CustomHostname>(`/zones/${env("CLOUDFLARE_ZONE_ID")}/custom_hostnames/${id}`)
}

export async function deleteCustomHostname(id: string) {
  await cf(`/zones/${env("CLOUDFLARE_ZONE_ID")}/custom_hostnames/${id}`, { method: "DELETE" })
}
