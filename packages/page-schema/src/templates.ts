import type { NewSection } from "./ops"
import type { SectionType } from "./schema"

/** Starter content for each section type, used by "Add section" in the editor. */
export const SECTION_TEMPLATES: { [T in SectionType]: Extract<NewSection, { type: T }> } = {
  navbar: {
    type: "navbar",
    props: {
      brand: "Brand",
      links: [
        { label: "Features", href: "#features" },
        { label: "Pricing", href: "#pricing" },
      ],
      cta: { label: "Get started", href: "#" },
      sticky: true,
    },
  },
  hero: {
    type: "hero",
    props: {
      layout: "centered",
      eyebrow: "New",
      heading: "A headline that says what you do",
      subheading: "One or two sentences on who it's for and why it's better.",
      primaryCta: { label: "Get started", href: "#" },
      secondaryCta: { label: "Learn more", href: "#" },
    },
    animation: "fade-up",
  },
  logos: {
    type: "logos",
    props: { title: "Trusted by teams at", logos: [] },
  },
  features: {
    type: "features",
    props: {
      heading: "Everything you need",
      subheading: "A short line about the benefits.",
      columns: 3,
      variant: "cards",
      items: [
        { icon: "⚡", title: "Fast", body: "Explain the first benefit." },
        { icon: "🔒", title: "Secure", body: "Explain the second benefit." },
        { icon: "🧩", title: "Flexible", body: "Explain the third benefit." },
      ],
    },
    animation: "fade-up",
  },
  content: {
    type: "content",
    props: {
      heading: "Tell one part of the story",
      body: "Describe a feature or use case in a few sentences.",
      bullets: ["First point", "Second point"],
      imagePosition: "right",
    },
    animation: "fade-up",
  },
  stats: {
    type: "stats",
    props: {
      items: [
        { value: "10k+", label: "Customers" },
        { value: "99.9%", label: "Uptime" },
        { value: "24/7", label: "Support" },
      ],
    },
  },
  testimonials: {
    type: "testimonials",
    props: {
      heading: "What customers say",
      items: [{ quote: "Add a real customer quote here.", author: "Customer name", role: "Role, Company" }],
    },
  },
  pricing: {
    type: "pricing",
    props: {
      heading: "Simple pricing",
      plans: [
        { name: "Starter", price: "$0", period: "/month", features: ["Feature one"], cta: { label: "Start free", href: "#" } },
        {
          name: "Pro",
          price: "$29",
          period: "/month",
          features: ["Everything in Starter", "Feature two"],
          cta: { label: "Upgrade", href: "#" },
          highlighted: true,
        },
      ],
    },
  },
  faq: {
    type: "faq",
    props: { heading: "Frequently asked questions", items: [{ question: "A common question?", answer: "A clear answer." }] },
  },
  gallery: {
    type: "gallery",
    props: { heading: "Gallery", columns: 3, images: [] },
  },
  cta: {
    type: "cta",
    props: { heading: "Ready to get started?", subheading: "One line to remove doubt.", primaryCta: { label: "Get started", href: "#" } },
    style: { background: "#111827", color: "#ffffff" },
  },
  footer: {
    type: "footer",
    props: { brand: "Brand", columns: [{ title: "Company", links: [{ label: "About", href: "#" }] }], copyright: "© Brand" },
  },
  custom: {
    type: "custom",
    props: { elements: [{ tag: "h2", text: "Custom section", style: { textAlign: "center" } }] },
  },
  html: {
    type: "html",
    props: {
      label: "HTML section",
      html: '<section style="padding:80px 24px;text-align:center"><h2>New section</h2><p>Edit this markup in the inspector or ask the AI.</p></section>',
    },
  },
}
