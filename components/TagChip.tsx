import type { CSSProperties } from "react";

export interface TagChipData {
  id: string;
  name: string;
  color: string;
}

/** Black or white text, whichever reads better on the tag's hex colour. */
export function readableTextColor(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#18181b";
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.4 ? "#18181b" : "#ffffff";
}

/**
 * The one way a tag is drawn (#213). Tags are rendered through this
 * component beside a name — never concatenated into a name string — so they
 * cannot leak into documents, emails or stored text. Internal UI only.
 */
export function TagChip({ tag, className = "" }: { tag: TagChipData; className?: string }) {
  const style: CSSProperties = { backgroundColor: tag.color, color: readableTextColor(tag.color) };
  return (
    <span
      data-tag-chip
      style={style}
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${className}`}
    >
      {tag.name}
    </span>
  );
}

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
