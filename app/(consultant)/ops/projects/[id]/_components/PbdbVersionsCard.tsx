import { DownloadCard } from "@/components/DownloadCard";
import { RegeneratePbdbButton } from "@/components/PbdbGenerationButtons";
import type { ProjectStatus } from "@/types";

type PbdbFile = {
  id: string;
  original_filename: string;
  version: number;
  created_at: string;
  revisionNote?: string | null;
};

export function PbdbVersionsCard({
  projectId,
  files,
  projectStatus,
  canRegenerate,
}: {
  projectId: string;
  files: PbdbFile[];
  projectStatus: ProjectStatus;
  canRegenerate: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.914a2 2 0 00-.586-1.414l-3.914-3.914A2 2 0 0012.086 2H4zm7 1.5V6a1 1 0 001 1h2.5L11 3.5zM6 9a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">PBDB</p>
      </div>

      <div className="space-y-1.5">
        {files.map((f, i) => {
          const isLatest = i === files.length - 1;
          const showDispatchedBadge =
            isLatest && (["dispatched", "revision_required"] as ProjectStatus[]).includes(projectStatus);
          return (
            <div key={f.id} className="space-y-1">
              <DownloadCard
                id={showDispatchedBadge ? "qa-pbdb-row" : undefined}
                href={`/api/download/pbdb/${f.id}`}
                filename={f.original_filename}
                wrapperClassName="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 transition-shadow duration-700"
                buttonClassName="shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                <p className="truncate text-xs font-medium text-zinc-900" title={f.original_filename}>
                  {f.original_filename}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="shrink-0 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                    v{f.version}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {new Date(f.created_at).toLocaleDateString("en-AU")}
                  </span>
                  {showDispatchedBadge && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                      Dispatched
                    </span>
                  )}
                </div>
              </DownloadCard>
              {f.revisionNote && (
                <p className="px-3 text-[11px] leading-relaxed text-zinc-500">{f.revisionNote}</p>
              )}
            </div>
          );
        })}
      </div>

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
