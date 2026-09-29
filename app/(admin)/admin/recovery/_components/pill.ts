// Shared pill-button classes for the recovery bin. 40px hit area on touch.
const BASE =
  "press rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-4";

export const PILL_NEUTRAL = `${BASE} border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus-visible:outline-zinc-900`;
export const PILL_MUTED = `${BASE} border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 focus-visible:outline-zinc-900`;
export const PILL_DANGER_OUTLINE = `${BASE} border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-red-700`;
export const PILL_DANGER_SOLID = `${BASE} border-red-300 bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-700`;
