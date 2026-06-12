export type TokenSource = "client" | "extract" | "org" | "sys" | "project" | "unknown";

export interface TokenPrefix {
  prefix: string;
  source: TokenSource;
  label: string;
  description: string;
}

export const TOKEN_PREFIXES: TokenPrefix[] = [
  { prefix: "CLIENT_",  source: "client",  label: "Client input", description: "Client enters directly on the submission form" },
  { prefix: "EXTRACT_", source: "extract", label: "Extracted",    description: "Claude extracts from uploaded docs; client inputs if extraction fails" },
  { prefix: "ORG_",     source: "org",     label: "Org config",   description: "Configured at org or stakeholder level" },
  { prefix: "SYS_",     source: "sys",     label: "System",       description: "Auto-populated by OPS (dates, revision numbers)" },
  { prefix: "PROJECT_", source: "project", label: "Project",      description: "Entered by consultant (project number etc.)" },
];

export function detectSource(token: string): TokenSource {
  const upper = token.toUpperCase();
  for (const { prefix, source } of TOKEN_PREFIXES) {
    if (upper.startsWith(prefix)) return source;
  }
  return "unknown";
}

export function isKnownToken(token: string): boolean {
  return detectSource(token) !== "unknown";
}
