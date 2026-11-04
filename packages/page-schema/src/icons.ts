// Icons a feature item can show: line icons from Lucide (lucide.dev, ISC
// license), drawn by the renderer as inline SVG in the theme's colors. Items
// name an icon; older pages may still hold an emoji, which renders as text.
// After changing this list run `bun run icons` to regenerate the renderer's SVG data.

export const ICON_NAMES = [
  // Speed, quality, trust
  "zap", "rocket", "sparkles", "star", "award", "trophy", "target", "gauge", "thumbs-up", "heart",
  "shield-check", "lock", "key", "fingerprint-pattern", "eye", "badge-check", "circle-check", "check", "infinity", "scale",
  // Growth and data
  "trending-up", "chart-bar", "chart-line", "chart-pie", "database", "layers", "filter", "search", "refresh-cw", "percent",
  // Time and place
  "clock", "timer", "calendar", "globe", "map-pin", "plane", "car", "bus", "truck", "house",
  // People and communication
  "users", "user", "user-check", "handshake", "headphones", "life-buoy", "phone", "mail", "message-circle", "messages-square",
  "send", "bell", "megaphone", "share-2", "link",
  // Business and commerce
  "briefcase", "building-2", "store", "shopping-cart", "shopping-bag", "package", "credit-card", "wallet", "banknote", "receipt",
  "tag", "gift", "file-text", "clipboard-check",
  // Technology
  "code", "terminal", "server", "cloud", "cpu", "bot", "brain", "smartphone", "monitor", "laptop",
  "wifi", "settings", "wrench", "puzzle", "layout-dashboard", "download", "upload",
  // Creative
  "palette", "pen-tool", "camera", "image", "video", "music", "lightbulb",
  // Industries
  "graduation-cap", "book-open", "stethoscope", "heart-pulse", "leaf", "recycle", "sun", "utensils", "coffee", "hotel",
  "dumbbell", "scissors", "shirt", "paw-print", "baby", "hammer",
] as const

export type IconName = (typeof ICON_NAMES)[number]

const NAMES = new Set<string>(ICON_NAMES)

export function isIconName(value: string | undefined): value is IconName {
  return !!value && NAMES.has(value)
}

/** Emojis models and older pages use, and the icon that replaces each. */
const EMOJI_ICONS: Record<string, IconName> = {
  "⚡": "zap", "🚀": "rocket", "✨": "sparkles", "⭐": "star", "🌟": "star", "🏆": "trophy", "🥇": "award", "🎯": "target",
  "👍": "thumbs-up", "❤️": "heart", "💖": "heart", "🔒": "lock", "🔐": "lock", "🛡️": "shield-check", "🔑": "key",
  "👁️": "eye", "✅": "circle-check", "✔️": "check", "♾️": "infinity", "⚖️": "scale", "📈": "trending-up", "📊": "chart-bar",
  "📉": "chart-line", "🗄️": "database", "🔍": "search", "🔎": "search", "🔄": "refresh-cw", "⏱️": "timer", "⏰": "clock",
  "🕒": "clock", "📅": "calendar", "🗓️": "calendar", "🌍": "globe", "🌎": "globe", "🌐": "globe", "📍": "map-pin",
  "✈️": "plane", "🚗": "car", "🚌": "bus", "🚚": "truck", "🏠": "house", "🏡": "house", "👥": "users", "👤": "user",
  "🤝": "handshake", "🎧": "headphones", "🆘": "life-buoy", "📞": "phone", "☎️": "phone", "📧": "mail", "✉️": "mail",
  "💬": "message-circle", "🗨️": "messages-square", "📨": "send", "🔔": "bell", "📢": "megaphone", "📣": "megaphone",
  "🔗": "link", "💼": "briefcase", "🏢": "building-2", "🏪": "store", "🛒": "shopping-cart", "🛍️": "shopping-bag",
  "📦": "package", "💳": "credit-card", "👛": "wallet", "💰": "banknote", "💵": "banknote", "🧾": "receipt", "🏷️": "tag",
  "🎁": "gift", "📄": "file-text", "📝": "file-text", "📋": "clipboard-check", "💻": "laptop", "🖥️": "monitor",
  "⌨️": "terminal", "☁️": "cloud", "🤖": "bot", "🧠": "brain", "📱": "smartphone", "📶": "wifi", "⚙️": "settings",
  "🔧": "wrench", "🛠️": "wrench", "🧩": "puzzle", "📥": "download", "📤": "upload", "🎨": "palette", "✏️": "pen-tool",
  "🖌️": "pen-tool", "📷": "camera", "📸": "camera", "🖼️": "image", "🎥": "video", "🎬": "video", "🎵": "music",
  "💡": "lightbulb", "🎓": "graduation-cap", "📚": "book-open", "📖": "book-open", "🩺": "stethoscope", "🏥": "heart-pulse",
  "💊": "heart-pulse", "🌿": "leaf", "🌱": "leaf", "♻️": "recycle", "☀️": "sun", "🍽️": "utensils", "🍴": "utensils",
  "☕": "coffee", "🏨": "hotel", "🏋️": "dumbbell", "💪": "dumbbell", "✂️": "scissors", "👕": "shirt", "🐾": "paw-print",
  "🐶": "paw-print", "👶": "baby", "🔨": "hammer", "🏗️": "hammer", "💯": "badge-check", "🎉": "sparkles", "🔥": "zap",
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u

/**
 * The icon to show for a feature item's `icon` value: names stay, emojis
 * become the closest icon (or sparkles), and anything else (e.g. "01") stays.
 */
export function iconFor(value: string | undefined): string | undefined {
  if (!value || isIconName(value)) return value
  if (!PICTOGRAPHIC.test(value)) return value
  const emoji = value.trim()
  return EMOJI_ICONS[emoji] ?? EMOJI_ICONS[emoji.replace(/️/g, "")] ?? EMOJI_ICONS[`${emoji.replace(/️/g, "")}️`] ?? "sparkles"
}

/** How the page-building rules describe icons to the model. */
export const ICON_RULE = `Feature icons: set icon to the name of the closest icon from this list, never an emoji: ${ICON_NAMES.join(", ")}.`
