import type { Metadata } from "next"

import { SignInForm } from "@/components/sign-in-form"

export const metadata: Metadata = {
  title: "Sign in · Magicwebs",
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  // Only same-site paths, so the link can't bounce people to another site.
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"
  return <SignInForm next={target} />
}
