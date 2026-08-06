import PizZip from "pizzip";

export interface StructureScanFinding {
  kind: "open_comments" | "tracked_changes" | "highlighted_runs";
  count: number;
  message: string;
}

/**
 * Deterministic, no-AI structural scan of a QA'd PBDB .docx for leftover
 * review markup a consultant may have forgotten to clean up before sending
 * to stakeholders (#112): open Word comments, tracked-changes (insertions/
 * deletions), and highlighted runs. Pure XML parsing — no rendering, no LLM
 * call, no in-document annotation. Findings are surfaced to the consultant
 * as a plain list; this only detects and reports, it never strips anything.
 *
 * Must never throw and block an otherwise-valid upload — a malformed or
 * unreadable .docx just means the scan can't run, same failure posture as
 * the sibling XML-surgery helpers in this directory (revision-table.ts,
 * color-strip.ts).
 */
export function scanDocxStructure(docxBuffer: Buffer): StructureScanFinding[] {
  try {
    const zip = new PizZip(docxBuffer);
    const findings: StructureScanFinding[] = [];

    const openComments = countOpenComments(zip);
    if (openComments > 0) {
      findings.push({
        kind: "open_comments",
        count: openComments,
        message: `${openComments} open comment${openComments === 1 ? "" : "s"} found`,
      });
    }

    const documentXml = zip.files["word/document.xml"]?.asText() ?? "";

    const trackedChanges = countMatches(documentXml, /<w:(ins|del)[ >]/g);
    if (trackedChanges > 0) {
      findings.push({
        kind: "tracked_changes",
        count: trackedChanges,
        message: `${trackedChanges} tracked change${trackedChanges === 1 ? "" : "s"} found`,
      });
    }

    // Two sources of highlight false-positives, both stripped before counting:
    //  1. <w:rPrChange> — a run's pre-tracked-change formatting snapshot, not
    //     what's currently rendered (a pending tracked change that removed a
    //     highlight still leaves the old <w:highlight> sitting in here).
    //  2. <w:pPr><w:rPr> — the paragraph MARK's own run properties (the
    //     invisible end-of-paragraph pilcrow), not the paragraph's visible
    //     text. Word never renders a highlight set only here against any
    //     actual content — it's copy-paste/template residue, not something a
    //     consultant would see as a highlighted run in the document.
    const documentXmlForHighlightScan = documentXml
      .replace(/<w:rPrChange\b[^>]*>[\s\S]*?<\/w:rPrChange>/g, "")
      .replace(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/g, "");
    const highlightedRuns = countMatches(
      documentXmlForHighlightScan,
      /<w:highlight w:val="(?!none")[^"]*"/g
    );
    if (highlightedRuns > 0) {
      findings.push({
        kind: "highlighted_runs",
        count: highlightedRuns,
        message: `${highlightedRuns} highlighted run${highlightedRuns === 1 ? "" : "s"} found`,
      });
    }

    return findings;
  } catch (err) {
    console.warn("[docx-structure-scan] Failed to scan document — skipping.", err);
    return [];
  }
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

/**
 * Counts comments present in word/comments.xml. Word's "resolved" state
 * (word/commentsExtended.xml, w15:done="1") keys off paragraph id rather
 * than the comment's own w:id, with no reliable cross-reference between the
 * two parts — so this deliberately doesn't attempt to filter resolved
 * comments out and instead reports every comment still in the document,
 * consistent with never under-reporting a genuinely open one.
 */
function countOpenComments(zip: PizZip): number {
  const commentsXml = zip.files["word/comments.xml"]?.asText();
  if (!commentsXml) return 0;
  return countMatches(commentsXml, /<w:comment[ >]/g);
}
