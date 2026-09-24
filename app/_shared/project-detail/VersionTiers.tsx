import { DownloadCard } from "@/components/DownloadCard";
import { FilePreviewButton } from "@/components/FilePreviewButton";
import {
  rejectedByLabel,
  type ActiveVersion,
  type HistoricalOutcome,
  type HistoricalVersion,
  type VersionEntry,
} from "@/lib/documents/pbdb-versions";

const ROW_CLASS =
  "flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 transition-shadow duration-700";
const BUTTON_CLASS =
  "shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100";

const OUTCOME_LABEL: Record<HistoricalOutcome, string> = {
  rejected: "rejected",
  reverted: "reverted after delivery",
  replaced: "replaced by a newer revision",
};

function historicalNote(entry: HistoricalVersion): string {
  return rejectedByLabel(entry.rejectedBy) ?? OUTCOME_LABEL[entry.outcome];
}

function Row({
  entry,
  projectId,
  href,
  rowId,
  badge,
  detail,
  cta,
}: {
  entry: VersionEntry;
  projectId: string;
  href: string | null;
  rowId?: string;
  badge?: React.ReactNode;
  detail?: string;
  cta?: string | null;
}) {
  return (
    <div className="space-y-1">
      <DownloadCard
        id={rowId}
        href={href}
        filename={entry.originalFilename}
        wrapperClassName={ROW_CLASS}
        buttonClassName={BUTTON_CLASS}
        preview={
          <FilePreviewButton projectId={projectId} fileId={entry.fileId} buttonClassName={BUTTON_CLASS} />
        }
      >
        <p className="truncate text-xs font-medium text-zinc-900" title={entry.originalFilename}>
          {entry.originalFilename}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-600">Rev {entry.revNumber}</span>
          <span className="text-xs text-zinc-500">
            {new Date(entry.createdAt).toLocaleDateString("en-AU")}
          </span>
          {badge}
        </div>
        {detail && <p className="mt-0.5 text-xs text-zinc-500">{detail}</p>}
      </DownloadCard>
      {cta && <p className="px-3 text-xs leading-relaxed text-amber-700">{cta}</p>}
      {entry.revisionNote && (
        <p className="px-3 text-xs leading-relaxed text-zinc-500">{entry.revisionNote}</p>
      )}
    </div>
  );
}

function CollapsedGroup({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-zinc-100">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700">
        {summary}
      </summary>
      <div className="space-y-1.5 px-1.5 pb-1.5">{children}</div>
    </details>
  );
}

/**
 * Active / Historical / collapsed-drafts presentation shared by the PBDB
 * versions card and the PBDR documents list (#198/#199). Grouping lives in
 * lib/documents — this only renders what it's given, so PBDR simply passes no
 * `drafts`.
 */
export function VersionTiers({
  projectId,
  active,
  historical,
  drafts = [],
  hrefFor,
  activeRowId,
}: {
  projectId: string;
  /** null when nothing is current — e.g. a delivered PBDR that has been reverted. */
  active: ActiveVersion | null;
  historical: HistoricalVersion[];
  drafts?: VersionEntry[];
  /** null renders the row without a download button (preview only). */
  hrefFor: (fileId: string, tier: "active" | "historical" | "draft") => string | null;
  activeRowId?: string;
}) {
  return (
    <div className="space-y-1.5">
      {active && (
        <Row
          entry={active}
          projectId={projectId}
          href={hrefFor(active.fileId, "active")}
          rowId={activeRowId}
          cta={active.ctaCopy}
          badge={
            active.badge === "dispatched" ? (
              <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                Dispatched
              </span>
            ) : active.badge === "draft" ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                Draft
              </span>
            ) : undefined
          }
        />
      )}
      {historical.length > 0 && (
        <CollapsedGroup summary={`Revision history (${historical.length})`}>
          {historical.map((h) => (
            <Row
              key={h.fileId}
              entry={h}
              projectId={projectId}
              href={hrefFor(h.fileId, "historical")}
              detail={historicalNote(h)}
            />
          ))}
        </CollapsedGroup>
      )}
      {drafts.length > 0 && (
        <CollapsedGroup summary={`${drafts.length} earlier draft${drafts.length === 1 ? "" : "s"}`}>
          {drafts.map((d) => (
            <Row key={d.fileId} entry={d} projectId={projectId} href={hrefFor(d.fileId, "draft")} />
          ))}
        </CollapsedGroup>
      )}
    </div>
  );
}
