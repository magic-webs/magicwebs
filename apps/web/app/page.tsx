import type { Metadata } from "next"

import { Landing } from "@/components/landing/landing"

export const metadata: Metadata = {
  title: "Magicwebs · Any website, ready for your agent to edit",
  description:
    "Clone any landing page exactly, edit it in the visual editor, with AI chat or from any MCP client, and publish it to your own domain.",
}

export default function Home() {
  return <Landing />
}
