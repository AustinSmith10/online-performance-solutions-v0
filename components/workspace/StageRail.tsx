export type StageState = "done" | "current" | "upcoming";
export type StageUrgency = "neutral" | "amber" | "red" | "green";
export type StageIcon = "number" | "document" | "people" | "refresh" | "flag";

export type Stage = {
  id: string;
  label: string;
  state: StageState;
  urgency?: StageUrgency;
  icon: StageIcon;
};

const URGENCY_BG: Record<StageUrgency, string> = {
  neutral: "bg-zinc-900",
  amber: "bg-amber-500",
  red: "bg-red-500",
  green: "bg-emerald-500",
};

const URGENCY_RING: Record<StageUrgency, string> = {
  neutral: "ring-zinc-200",
  amber: "ring-amber-200",
  red: "ring-red-200",
  green: "ring-emerald-200",
};

const URGENCY_TEXT: Record<StageUrgency, string> = {
  neutral: "text-zinc-900",
  amber: "text-amber-700",
  red: "text-red-700",
  green: "text-emerald-700",
};

function StageIconGlyph({ icon, className }: { icon: StageIcon; className?: string }) {
  switch (icon) {
    case "document":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.914a2 2 0 00-.586-1.414l-3.914-3.914A2 2 0 0012.086 2H4zm7 1.5V6a1 1 0 001 1h2.5L11 3.5zM6 9a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
        </svg>
      );
    case "people":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.106-.31.18-.632.217-.964a4.978 4.978 0 00-1.056-3.79 6.487 6.487 0 013.63 1.55.998.998 0 01.35.98A5.006 5.006 0 0114.5 16z" />
        </svg>
      );
    case "refresh":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 002.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0112.888 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
        </svg>
      );
    case "flag":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M2.75 2a.75.75 0 01.75.75v.372a3.75 3.75 0 011.5-.372h1.628c.646 0 1.28.198 1.813.567a2.25 2.25 0 001.281.383h2.809a.75.75 0 01.75.75v6.75a.75.75 0 01-.75.75h-2.81a2.25 2.25 0 01-1.28-.383 2.25 2.25 0 00-1.284-.317H5a2.25 2.25 0 00-2.25 2.25v2.5a.75.75 0 01-1.5 0V2.75A.75.75 0 012.75 2z" clipRule="evenodd" />
        </svg>
      );
    case "number":
    default:
      return null;
  }
}

export function StageRail({ stages }: { stages: Stage[] }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 px-6 py-5">
      <div className="flex items-start">
        {stages.map((stage, i) => {
          const isLast = i === stages.length - 1;
          const urgency = stage.urgency ?? "neutral";
          return (
            <div key={stage.id} className={`flex items-start ${isLast ? "" : "flex-1"}`}>
              <div className="flex flex-col items-center gap-2">
                {stage.state === "done" ? (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-200">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : stage.state === "current" ? (
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${URGENCY_BG[urgency]} text-white shadow-sm ring-[5px] ${URGENCY_RING[urgency]}`}
                  >
                    {stage.icon === "number" ? (
                      <span className="text-xs font-semibold">{i + 1}</span>
                    ) : (
                      <StageIconGlyph icon={stage.icon} className="h-4 w-4" />
                    )}
                  </div>
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-300 bg-white text-zinc-300">
                    {stage.icon === "number" ? (
                      <span className="text-xs font-semibold">{i + 1}</span>
                    ) : (
                      <StageIconGlyph icon={stage.icon} className="h-4 w-4" />
                    )}
                  </div>
                )}
                <span
                  className={`max-w-[6.5rem] text-center text-[11px] font-medium leading-tight ${
                    stage.state === "upcoming"
                      ? "text-zinc-400"
                      : stage.state === "current"
                      ? URGENCY_TEXT[urgency]
                      : "text-zinc-700"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {!isLast && (
                <div className="mt-[18px] mx-1.5 h-[3px] flex-1 rounded-full bg-zinc-150 overflow-hidden bg-zinc-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      stage.state === "done" ? "w-full bg-emerald-400" : "w-0"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
