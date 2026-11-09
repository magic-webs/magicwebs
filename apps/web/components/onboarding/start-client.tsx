"use client"

import dynamic from "next/dynamic"

// The start page picks up a plan saved in this tab (e.g. on the way back from
// Google sign-in), so it renders in the browser only.
export const StartClient = dynamic(() => import("./onboarding").then((m) => m.Onboarding), {
  ssr: false,
  loading: () => <div style={{ minHeight: "100svh", background: "#fff" }} />,
})
