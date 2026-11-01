"use client"

import { X } from "lucide-react"

import {
  AnimationSchema,
  SectionPropsSchemas,
  SectionStyleSchema,
  type Op,
  type Section,
} from "@magicwebs/page-schema"

import { Button } from "@/components/ui/button"

import { EnumField, ValueField, type Commit } from "./fields"

const ENUMS: Record<string, readonly string[]> = {
  layout: SectionPropsSchemas.hero.shape.layout.options,
  variant: SectionPropsSchemas.features.shape.variant.options,
  imagePosition: SectionPropsSchemas.content.shape.imagePosition.options,
  align: SectionStyleSchema.shape.align.unwrap().options,
}

const STYLE_FIELDS = ["background", "color", "backgroundImage", "overlay", "paddingY", "align", "fullBleed"] as const
const STYLE_SAMPLES: Record<(typeof STYLE_FIELDS)[number], unknown> = {
  background: "",
  color: "",
  backgroundImage: "",
  overlay: "",
  paddingY: 96,
  align: undefined,
  fullBleed: false,
}

export function Inspector({
  section,
  apply,
  onClose,
}: {
  section: Section
  apply: (...ops: Op[]) => Promise<void>
  onClose: () => void
}) {
  const commit: Commit = (path, value) => {
    // Empty style strings mean "use the theme default".
    const cleared = path.startsWith("style.") && value === "" ? null : value
    void apply({ op: "set_field", sectionId: section.id, path, value: cleared })
  }
  const style = section.style ?? {}

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium capitalize">{section.type}</span>
          <span className="font-mono text-xs text-muted-foreground">{section.id}</span>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close inspector">
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Content</h3>
          {Object.entries(section.props).map(([key, value]) => (
            <ValueField key={key} name={key} path={`props.${key}`} value={value} commit={commit} enums={ENUMS} />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Style</h3>
          {STYLE_FIELDS.map((key) => (
            <ValueField
              key={key}
              name={key}
              path={`style.${key}`}
              value={style[key] ?? STYLE_SAMPLES[key]}
              commit={commit}
              enums={ENUMS}
            />
          ))}
          <EnumField
            label="Animation"
            path="animation"
            value={section.animation}
            options={AnimationSchema.options}
            commit={(_, value) =>
              apply({ op: "set_section_animation", sectionId: section.id, animation: (value ?? "none") as Section["animation"] & string })
            }
          />
        </div>
      </div>
    </div>
  )
}
