import type { CSSProperties } from "react";
import { tagColors } from "@/lib/tags/color";

export interface TagChipData {
  id: string;
  name: string;
  color: string;
}

/**
 * The one way a tag is drawn (#213). Tags render through this component beside
 * a name, never concatenated into a name string, so they cannot leak into
 * documents, emails or stored text. Internal UI only.
 *
 * A standard status-pill shape (DESIGN.md: rounded-full, 12px/500) in a quiet
 * tint of the tag's hue, so a tag reads as a label, not as workflow state.
 */
export function TagChip({ tag, className = "" }: { tag: TagChipData; className?: string }) {
  const { bg, fg } = tagColors(tag.color);
  const style: CSSProperties = { backgroundColor: bg, color: fg };
  return (
    <span
      data-tag-chip
      style={style}
      title={tag.name}
      className={`inline-flex max-w-[10rem] shrink-0 items-center truncate whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {tag.name}
    </span>
  );
}

/** A row of chips. Renders nothing when there are none, so callers never leave an empty gap. */
export function TagChips({ tags, className = "" }: { tags: TagChipData[] | undefined; className?: string }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {tags.map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
    </span>
  );
}
