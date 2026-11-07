"use client"

import { cn } from "@/lib/utils"

// The launcher icons and animations of Magic Agent's chat widget, drawn as its
// embed.js draws them (magic-agent: app/widget/[channelKey]/embed.js/route.ts),
// so the editor's preview matches the live site.

export type WidgetIcon = "chat-dots" | "chat" | "sparkles" | "bot" | "headset" | "smile" | "help" | "whatsapp"
export type WidgetAnimation = "none" | "pulse" | "bounce" | "wiggle" | "breathe"

/** [label, filled, inner SVG] */
export const WIDGET_ICONS: Record<WidgetIcon, [string, boolean, string]> = {
  "chat-dots": ["Chat", false, '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="3"/>'],
  chat: ["Bubble", true, '<path d="M12 3c-4.97 0-9 3.58-9 8 0 2.37 1.16 4.5 3 5.95V21l3.3-1.65c.86.23 1.76.35 2.7.35 4.97 0 9-3.58 9-8s-4.03-8-9-8Z"/>'],
  sparkles: [
    "AI",
    false,
    '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0Z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
  ],
  bot: ["Bot", false, '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>'],
  headset: [
    "Support",
    false,
    '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>',
  ],
  smile: ["Smile", false, '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01" stroke-width="3"/>'],
  help: ["Help", false, '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01" stroke-width="3"/>'],
  whatsapp: [
    "WhatsApp",
    true,
    '<path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01ZM12.05 20.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.18 8.18 0 0 1 5.82 2.42 8.16 8.16 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.4-.12-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.6.19 1.14.16 1.57.1.48-.07 1.49-.61 1.7-1.2.21-.59.21-1.1.15-1.2-.06-.11-.23-.17-.48-.29Z"/>',
  ],
}

export const WIDGET_ANIMATIONS: { value: WidgetAnimation; label: string }[] = [
  { value: "none", label: "None" },
  { value: "pulse", label: "Pulse" },
  { value: "bounce", label: "Bounce" },
  { value: "wiggle", label: "Wiggle" },
  { value: "breathe", label: "Breathe" },
]

/** The same keyframes as embed.js, scoped to the preview. */
const PREVIEW_CSS = `
.mw-launcher{position:relative;isolation:isolate}
.mw-launcher[data-animation=pulse]::before{content:"";position:absolute;inset:0;border-radius:50%;background:inherit;z-index:-1;animation:mw-pulse 2s ease-out infinite}
.mw-launcher[data-animation=bounce]{animation:mw-bounce 3.2s ease-in-out 1s infinite}
.mw-launcher[data-animation=wiggle] svg{animation:mw-wiggle 3.5s ease-in-out 1s infinite}
.mw-launcher[data-animation=breathe]{animation:mw-breathe 2.4s ease-in-out infinite alternate}
@keyframes mw-pulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.7);opacity:0}}
@keyframes mw-bounce{0%,30%,100%{transform:translateY(0)}10%{transform:translateY(-12px)}18%{transform:translateY(0)}24%{transform:translateY(-5px)}}
@keyframes mw-wiggle{0%,30%,100%{transform:rotate(0)}5%{transform:rotate(-16deg)}10%{transform:rotate(14deg)}15%{transform:rotate(-10deg)}20%{transform:rotate(6deg)}25%{transform:rotate(-2deg)}}
@keyframes mw-breathe{from{transform:scale(1)}to{transform:scale(1.08)}}
@media (prefers-reduced-motion:reduce){.mw-launcher,.mw-launcher::before,.mw-launcher svg{animation:none!important}}
`

export function IconGlyph({ icon, size = 24 }: { icon: WidgetIcon; size?: number }) {
  const [, filled, body] = WIDGET_ICONS[icon]
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      {...(filled
        ? { fill: "currentColor" }
        : { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const })}
      // Static markup from the table above.
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}

/** The launcher button as visitors see it. */
export function LauncherPreview({
  icon,
  animation,
  color,
  className,
}: {
  icon: WidgetIcon
  animation: WidgetAnimation
  color: string
  className?: string
}) {
  return (
    <>
      <style>{PREVIEW_CSS}</style>
      <span
        // Remount on change so the animation restarts from its first frame.
        key={`${icon}-${animation}`}
        data-animation={animation}
        className={cn("mw-launcher flex size-14 shrink-0 items-center justify-center rounded-full text-white shadow-lg", className)}
        style={{ background: color }}
      >
        <IconGlyph icon={icon} size={WIDGET_ICONS[icon][1] ? 28 : 26} />
      </span>
    </>
  )
}
