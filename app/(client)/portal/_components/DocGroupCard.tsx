import { DownloadCard } from "@/components/DownloadCard";

// Mirrors the consultant's PbdbVersionsCard
// (app/(consultant)/ops/projects/[id]/_components/PbdbVersionsCard.tsx):
// icon-badge + uppercase label header, each file as a zinc-50 row with an
// optional version pill + date, a real DownloadCard button, and an optional
// consultant revision note underneath — so a client sees the same document
// affordance a consultant already does.

export type DocGroupIcon = "document" | "flag";

export interface DocGroupFile {
  id: string;
  name: string;
  href: string | null;
  date: string;
  version?: number;
  badge?: string;
  note?: string;
  external?: boolean;
}

export function DocGroupCard({
  icon,
  label,
  files,
}: {
  icon: DocGroupIcon;
  label: string;
  files: DocGroupFile[];
}) {
  if (files.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          {icon === "document" ? (
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.914a2 2 0 00-.586-1.414l-3.914-3.914A2 2 0 0012.086 2H4zm7 1.5V6a1 1 0 001 1h2.5L11 3.5zM6 9a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2.75 2a.75.75 0 01.75.75v.372a3.75 3.75 0 011.5-.372h1.628c.646 0 1.28.198 1.813.567a2.25 2.25 0 001.281.383h2.809a.75.75 0 01.75.75v6.75a.75.75 0 01-.75.75h-2.81a2.25 2.25 0 01-1.28-.383 2.25 2.25 0 00-1.284-.317H5a2.25 2.25 0 00-2.25 2.25v2.5a.75.75 0 01-1.5 0V2.75A.75.75 0 012.75 2z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      </div>

      <div className="space-y-1.5">
        {files.map((f) => (
          <div key={f.id} className="space-y-1">
            <DownloadCard
              href={f.href}
              filename={f.name}
              external={f.external}
              wrapperClassName="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2"
              buttonClassName="shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              <p className="truncate text-xs font-medium text-zinc-900" title={f.name}>
                {f.name}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {f.version !== undefined && (
                  <span className="shrink-0 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                    v{f.version}
                  </span>
                )}
                <span className="text-[11px] text-zinc-400">{f.date}</span>
                {f.badge && (
                  <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                    {f.badge}
                  </span>
                )}
              </div>
            </DownloadCard>
            {f.note && (
              <p className="px-3 text-[11px] leading-relaxed text-zinc-500">
                <span className="font-medium text-zinc-600">Consultant&apos;s note:</span> {f.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
