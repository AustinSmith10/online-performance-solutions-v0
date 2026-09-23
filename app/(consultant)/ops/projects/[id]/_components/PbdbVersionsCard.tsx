import { RegeneratePbdbButton } from "@/components/PbdbGenerationButtons";
import { VersionTiers } from "@/app/_shared/project-detail/VersionTiers";
import type { PbdbVersionGrouping } from "@/lib/documents/pbdb-versions";

export function PbdbVersionsCard({
  projectId,
  grouping,
  canRegenerate,
  id,
}: {
  projectId: string;
  grouping: PbdbVersionGrouping;
  canRegenerate: boolean;
  id?: string;
}) {
  return (
    <div id={id} className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.914a2 2 0 00-.586-1.414l-3.914-3.914A2 2 0 0012.086 2H4zm7 1.5V6a1 1 0 001 1h2.5L11 3.5zM6 9a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">PBDB</p>
      </div>

      <VersionTiers
        projectId={projectId}
        active={grouping.active}
        historical={grouping.historical}
        drafts={grouping.drafts}
        hrefFor={(fileId) => `/api/download/pbdb/${fileId}`}
        // QaUploadedBanner scrolls to / highlights this row after a QA upload.
        activeRowId={grouping.active.badge === "none" ? undefined : "qa-pbdb-row"}
      />

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
        {canRegenerate && (
          <p className="text-[11px] leading-relaxed text-zinc-400">
            Regenerating keeps existing versions and adds a new one.
          </p>
        )}
        <RegeneratePbdbButton
          projectId={projectId}
          disabledMessage={canRegenerate ? undefined : "Only available before the PBDB is dispatched."}
        />
      </div>
    </div>
  );
}
