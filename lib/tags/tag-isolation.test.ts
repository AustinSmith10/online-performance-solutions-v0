import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Tags are internal-UI only (#213): no generated document, email or stored
// notification text may import the tag module or read the tag tables.
const ROOT = process.cwd();
const FORBIDDEN = [/lib\/tags/, /components\/TagChip/, /["'`]account_tags["'`]/, /from\(\s*["'`]tags["'`]\s*\)/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const BUILDER_DIRS = ["lib/documents", "lib/email", "lib/notifications"];
const BUILDER_FILES = ["lib/stakeholders/dispatch.ts", "lib/stakeholders/buffer-update.ts", "lib/stakeholders/review-outcome.ts"];

describe("tags stay out of documents, emails and notifications", () => {
  const files = [
    ...BUILDER_DIRS.flatMap((d) => walk(join(ROOT, d))),
    ...BUILDER_FILES.map((f) => join(ROOT, f)),
  ];

  it("scans a meaningful set of builder files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.replace(ROOT + "/", ""), f]))("%s does not touch tags", (_n, f) => {
    const src = readFileSync(f, "utf8");
    for (const re of FORBIDDEN) expect(src, `${f} matches ${re}`).not.toMatch(re);
  });
});
