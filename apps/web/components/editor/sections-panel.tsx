"use client"

import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react"

import { SECTION_TEMPLATES, SECTION_TYPES, type Op, type PageDoc } from "@magicwebs/page-schema"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

function sectionLabel(props: Record<string, unknown>): string {
  const label = props.heading ?? props.brand ?? props.title ?? props.copyright
  return typeof label === "string" ? label : ""
}

export function SectionsPanel({
  doc,
  selectedId,
  onSelect,
  apply,
}: {
  doc: PageDoc
  selectedId: string | null
  onSelect: (id: string) => void
  apply: (...ops: Op[]) => Promise<void>
}) {
  const insertIndex = () => {
    const selected = doc.sections.findIndex((s) => s.id === selectedId)
    return selected === -1 ? undefined : selected + 1
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {doc.sections.map((section, index) => (
          <li key={section.id}>
            <div
              className={cn(
                "group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                section.id === selectedId ? "bg-muted" : "hover:bg-muted/60",
                section.hidden && "opacity-50",
              )}
            >
              <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => onSelect(section.id)}>
                <span className="font-medium capitalize">{section.type}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {sectionLabel(section.props as Record<string, unknown>) || section.id}
                </span>
              </button>
              <div className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => apply({ op: "move_section", sectionId: section.id, toIndex: index - 1 })}
                >
                  <ArrowUp />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Move down"
                  disabled={index === doc.sections.length - 1}
                  onClick={() => apply({ op: "move_section", sectionId: section.id, toIndex: index + 1 })}
                >
                  <ArrowDown />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={section.hidden ? "Show" : "Hide"}
                  onClick={() => apply({ op: "set_section_visibility", sectionId: section.id, hidden: !section.hidden })}
                >
                  {section.hidden ? <Eye /> : <EyeOff />}
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Duplicate"
                  onClick={() => apply({ op: "duplicate_section", sectionId: section.id })}
                >
                  <Copy />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={() => apply({ op: "remove_section", sectionId: section.id })}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="w-full" />}>
            <Plus />
            Add section
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-80">
            {SECTION_TYPES.map((type) => (
              <DropdownMenuItem
                key={type}
                className="capitalize"
                onClick={() => apply({ op: "add_section", section: SECTION_TEMPLATES[type], index: insertIndex() })}
              >
                {type}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
