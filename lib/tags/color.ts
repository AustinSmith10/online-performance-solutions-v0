/**
 * Tag colours (#213 UX pass). Colour is reserved for workflow state in this
 * app (DESIGN.md), so a tag renders as a quiet tint of its hue: a ~12% wash
 * for the pill and a darkened shade of the same hue for the label, which is
 * what keeps the text readable whatever hue the super admin picked. Pure, so
 * it is unit-tested for contrast.
 */
export interface TagSwatch {
  name: string;
  hex: string;
}

/** The colours offered in the manager. Stored as hex; any valid hex still renders. */
export const TAG_SWATCHES: TagSwatch[] = [
  { name: "Slate", hex: "#64748b" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Green", hex: "#16a34a" },
  { name: "Amber", hex: "#d97706" },
  { name: "Rose", hex: "#e11d48" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Pink", hex: "#db2777" },
];

export const DEFAULT_TAG_COLOR = TAG_SWATCHES[1].hex;

function parse(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function mix(rgb: [number, number, number], target: number, amount: number): [number, number, number] {
  return rgb.map((c) => Math.round(c + (target - c) * amount)) as [number, number, number];
}

const toHex = (rgb: [number, number, number]) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");

export function tagColors(hex: string): { bg: string; fg: string } {
  const rgb = parse(hex);
  if (!rgb) return { bg: "#f4f4f5", fg: "#3f3f46" };
  const bg = toHex(mix(rgb, 255, 0.88));
  // Darken the hue until the label clears AA on its own tint (a pale hue
  // like yellow needs more than the default half-way shade).
  let amount = 0.5;
  let fg = toHex(mix(rgb, 0, amount));
  while (amount < 1 && contrastRatio(fg, bg) < 4.5) {
    amount += 0.05;
    fg = toHex(mix(rgb, 0, amount));
  }
  return { bg, fg };
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(aHex: string, bHex: string): number {
  const a = parse(aHex);
  const b = parse(bHex);
  if (!a || !b) return 1;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
