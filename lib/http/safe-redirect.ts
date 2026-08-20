export function isSafeRedirectPath(next: string | null | undefined): boolean {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//") || next.startsWith("/\\")) return false;
  if (next.includes("://")) return false;
  return true;
}
