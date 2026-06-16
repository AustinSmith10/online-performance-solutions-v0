const TOKEN_PREFIXES = /^(EXTRACT|CLIENT|ORG|SYS|PROJECT)_/;

export function prettifyToken(token: string): string {
  return token
    .replace(TOKEN_PREFIXES, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
