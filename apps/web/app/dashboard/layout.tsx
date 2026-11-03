import type { Metadata } from "next"

import { AuthGate } from "@/components/auth-gate"
import { DashboardShell } from "@/components/dashboard/shell"

export const metadata: Metadata = {
  title: "Dashboard · Magicwebs",
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <DashboardShell>{children}</DashboardShell>
    </AuthGate>
  )
}
