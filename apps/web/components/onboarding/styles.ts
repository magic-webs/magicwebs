// Class strings shared by the /start page's steps (onboarding.tsx, build-view.tsx, account-panel.tsx).
// Colours, shadows and easings are the mw-* tokens from app/globals.css; the page root sets --mw-accent to ink.

/** A loader that turns. */
export const spin = "animate-[mw-spin_1s_linear_infinite]"

export const card = "rounded-[24px] bg-white shadow-mw-window"
export const cardPad = "flex flex-col gap-3.5 p-[26px]"
/** A card straight inside `narrow` gets a little more room. */
export const narrowCardPad = "p-7"
export const cardTitle = "text-[22px] font-semibold tracking-[-0.03em]"

export const narrow = "flex w-full max-w-[560px] min-h-0 max-h-full flex-col gap-[clamp(12px,2.6dvh,24px)]"
export const centerFill = "grid w-full min-h-60 h-full place-items-center"

export const intro = "flex flex-none flex-col items-center gap-[clamp(6px,1.4dvh,12px)] text-center"
export const lead =
  "max-w-[560px] text-mw-subtle text-[length:clamp(15px,2dvh,17px)] font-medium tracking-[-0.015em] leading-[1.4] text-balance"

export const muted = "text-mw-subtle text-[15px] leading-[1.5]"
export const mutedSmall = "text-mw-subtle text-[13px]"
export const mono = "font-mw-mono"

export const error = "rounded-[12px] px-3.5 py-2.5 bg-[#fff1f1] text-[#b42318] text-[14px] text-center"

export const primaryBtn =
  "inline-flex h-[42px] items-center justify-center gap-2 rounded-full px-5 bg-[linear-gradient(#333,#202020)] shadow-mw-btn-dark text-[#fafafa] text-[14px] font-[550] disabled:opacity-60 [&_svg]:size-4"
export const ghostBtn =
  "inline-flex h-[42px] items-center rounded-full px-[18px] text-mw-strong text-[14px] font-medium hover:bg-[#8080801f]"
export const textBtn = "self-center text-mw-subtle text-[14px] underline-offset-4 hover:underline"
