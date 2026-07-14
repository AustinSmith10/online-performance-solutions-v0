"use client";

// Consultant onboarding tour — spotlight overlay over a render-only fake
// project, mounted on the real /ops page. Opens when the URL carries
// ?tour=1 (from the invite card or the sidebar "How this works" link), walks
// the 7-step workflow, and marks the tour seen on finish or skip.
//
// The fake stage covers the main content area only (the real sidebar stays
// visible but dimmed by the full-viewport mask). Nothing here touches the DB
// or fires a server action: the spotlight mask makes only the highlighted
// control clickable, and that click just advances the tour.

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { markOnboardingStepSeen } from "@/app/actions/onboarding";
import { CollapsibleSection } from "@/app/(consultant)/ops/projects/[id]/_components/CollapsibleSection";
import { StageRail } from "@/app/(consultant)/ops/projects/[id]/_components/StageRail";
import type { Stage } from "@/app/(consultant)/ops/projects/[id]/_components/StageRail";
import { FocusCard } from "@/app/(consultant)/ops/projects/[id]/_components/FocusCard";
import {
  CONSULTANT_TOUR_PARAM,
  CONSULTANT_TOUR_SEEN_KEY,
  CONSULTANT_TOUR_STEPS as STEPS,
  type ConsultantTourScreen,
  type ConsultantTourTab,
} from "@/lib/onboarding/consultant-tour";

type Rect = { top: number; left: number; width: number; height: number };

export function ConsultantTour() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [screen, setScreen] = useState<ConsultantTourScreen>("list");
  const [listTab, setListTab] = useState<ConsultantTourTab>("workspace");

  // Open when ?tour=1 is present, then strip the param so a refresh doesn't
  // reopen it and the URL stays clean.
  useEffect(() => {
    if (searchParams.get(CONSULTANT_TOUR_PARAM) === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing tour state to the ?tour=1 URL param, an external system
      setStepIndex(0);
      setScreen(STEPS[0].screen);
      setListTab(STEPS[0].listTab ?? "workspace");
      setActive(true);
      router.replace("/ops", { scroll: false });
    }
  }, [searchParams, router]);

  // Keep the fake stage on whichever screen/tab the current step lives on.
  useEffect(() => {
    if (!active) return;
    const s = STEPS[stepIndex];
    if (!s) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing fake-stage screen/tab to the current tour step
    if (s.screen !== screen) setScreen(s.screen);
    if (s.listTab && s.listTab !== listTab) setListTab(s.listTab);
  }, [active, stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    setActive(false);
    markOnboardingStepSeen(CONSULTANT_TOUR_SEEN_KEY);
  }
  function next() {
    if (stepIndex >= STEPS.length - 1) {
      close();
      return;
    }
    setStepIndex((i) => i + 1);
  }
  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  const { rect, vp } = useViewportSpotlight(active, stepIndex, screen, listTab);
  const step = STEPS[stepIndex];
  const tipW = 288;
  const tipH = 150;
  const pos = rect ? tooltipPos(rect, vp, tipW, tipH) : null;

  if (!active) return null;

  return (
    <>
      {/* Fake stage — main content area only; real sidebar (w-56) stays put */}
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-zinc-50 lg:left-56">
        <div className="p-4 lg:p-8">
          {screen === "list" ? (
            <FakeList listTab={listTab} setListTab={setListTab} />
          ) : (
            <FakeDetail />
          )}
        </div>
      </div>

      {/* Dim mask + spotlight + tooltip */}
      {rect && (
        <div className="fixed inset-0 z-[70]">
          <SpotlightMask rect={rect} vp={vp} onHoleClick={next} />
          {pos && (
            <div
              className="fixed z-[80] w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl transition-all duration-200"
              style={{ top: pos.top, left: pos.left }}
            >
              <p className="text-[11px] font-medium uppercase tracking-wider text-blue-500">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-900">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">{step.caption}</p>
              <div className="mt-3 flex items-center justify-between">
                <button onClick={close} className="text-xs text-zinc-500 hover:underline">
                  Skip tour
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={back}
                    disabled={stepIndex === 0}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    onClick={next}
                    className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
                  >
                    {stepIndex === STEPS.length - 1 ? "Done" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Spotlight geometry ─────────────────────────────────────────────────────

function useViewportSpotlight(
  active: boolean,
  stepIndex: number,
  screen: ConsultantTourScreen,
  listTab: ConsultantTourTab
) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const step = STEPS[stepIndex];

  useLayoutEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing spotlight geometry to the DOM, an external system
      setRect(null);
      return;
    }
    function measure() {
      const el = document.getElementById(step.targetId);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setVp({ w: window.innerWidth, h: window.innerHeight });
    }
    document.getElementById(step.targetId)?.scrollIntoView({ block: "center", behavior: "auto" });
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, stepIndex, screen, listTab, step?.targetId]);

  return { rect, vp };
}

function SpotlightMask({
  rect,
  vp,
  onHoleClick,
}: {
  rect: Rect;
  vp: { w: number; h: number };
  onHoleClick: () => void;
}) {
  const pad = 6;
  const t = rect.top - pad;
  const l = rect.left - pad;
  const r = rect.left + rect.width + pad;
  const b = rect.top + rect.height + pad;
  const dim = "fixed bg-black/60";
  const swallow = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      <div className={dim} style={{ top: 0, left: 0, width: vp.w, height: Math.max(0, t) }} onClick={swallow} />
      <div className={dim} style={{ top: b, left: 0, width: vp.w, height: Math.max(0, vp.h - b) }} onClick={swallow} />
      <div className={dim} style={{ top: t, left: 0, width: Math.max(0, l), height: b - t }} onClick={swallow} />
      <div className={dim} style={{ top: t, left: r, width: Math.max(0, vp.w - r), height: b - t }} onClick={swallow} />
      <button
        aria-label="Continue tour"
        onClick={onHoleClick}
        className="fixed rounded-lg ring-2 ring-blue-400"
        style={{ top: t, left: l, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      />
    </>
  );
}

function tooltipPos(rect: Rect, vp: { w: number; h: number }, tipW: number, tipH: number) {
  const gap = 14;
  const below = rect.top + rect.height + gap;
  const top = below + tipH <= vp.h ? below : Math.max(gap, rect.top - gap - tipH);
  let left = rect.left;
  if (left + tipW > vp.w - 12) left = vp.w - 12 - tipW;
  if (left < 12) left = 12;
  return { top, left };
}

// ─── Fake stage — the real workspace, rendered with a fixture project ───────

function FakeList({
  listTab,
  setListTab,
}: {
  listTab: ConsultantTourTab;
  setListTab: (t: ConsultantTourTab) => void;
}) {
  const tabBtn = (on: boolean) =>
    `relative rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
      on ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
    }`;
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-zinc-900">My projects</h1>
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1">
          <button onClick={() => setListTab("workspace")} className={tabBtn(listTab === "workspace")}>
            Workspace
          </button>
          <button id="t-tab-available" onClick={() => setListTab("available")} className={tabBtn(listTab === "available")}>
            Available jobs
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                listTab === "available" ? "bg-white text-zinc-900" : "bg-blue-600 text-white"
              }`}
            >
              3
            </span>
          </button>
          <button className={tabBtn(false)}>Archive</button>
        </div>
      </div>

      {listTab === "available" ? (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Available jobs (3)</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Project</th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Client</th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Submitted</th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Expected delivery</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                <tr className="hover:bg-zinc-50">
                  <td className="max-w-[200px] truncate px-5 py-3 font-medium text-zinc-900">27 Parkland Ave, Rouse Hill</td>
                  <td className="max-w-[160px] truncate px-5 py-3 text-zinc-600">Mirvac</td>
                  <td className="whitespace-nowrap px-5 py-3 text-zinc-500">8 Jul 2026</td>
                  <td className="whitespace-nowrap px-5 py-3 text-zinc-500">18 Jul 2026</td>
                  <td className="px-5 py-3 text-right">
                    <button id="t-pickup" className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                      Pick up →
                    </button>
                  </td>
                </tr>
                {[
                  ["3 Lakeside Dr, Gledswood", "Stockland", "7 Jul 2026", "17 Jul 2026"],
                  ["9 Ridgeline Ct, Box Hill", "Frasers", "6 Jul 2026", "16 Jul 2026"],
                ].map(([a, c, s, d]) => (
                  <tr key={a} className="hover:bg-zinc-50">
                    <td className="max-w-[200px] truncate px-5 py-3 font-medium text-zinc-900">{a}</td>
                    <td className="max-w-[160px] truncate px-5 py-3 text-zinc-600">{c}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-zinc-500">{s}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-zinc-500">{d}</td>
                    <td className="px-5 py-3 text-right">
                      <button className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                        Pick up →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Active</h2>

          {/* Admin-assigned job — highlighted card w/ inline accept (issue #95 pattern) */}
          <div id="t-assigned" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900 leading-snug">Site 228, 85 Twists Road, Burpengary East QLD</p>
                <p className="mt-0.5 truncate text-xs font-medium text-amber-700">Stockland · assigned to you</p>
              </div>
              <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Assigned</span>
            </div>
            <div className="mt-2.5 flex items-center gap-2 border-t border-amber-200 pt-2.5">
              <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">Accept</button>
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white">Decline</button>
            </div>
          </div>

          {/* Active project — accepted, in progress */}
          <div id="t-open" className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900 leading-snug">1 Harbour View Tce, Wentworth Point</p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">Stockland</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">In Progress</span>
                <p className="whitespace-nowrap text-xs text-zinc-500">Expected 17 Jul 2026</p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const FAKE_STAGES: Stage[] = [
  { id: "number", label: "Project number", state: "current", icon: "number" },
  { id: "pbdb", label: "PBDB generated", state: "upcoming", icon: "document" },
  { id: "review", label: "Stakeholder review", state: "upcoming", icon: "people" },
  { id: "converting", label: "Converting to PBDR", state: "upcoming", urgency: "green", icon: "refresh" },
  { id: "delivered", label: "Delivered", state: "upcoming", icon: "flag" },
];

function FakeDetail() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <span className="text-sm text-zinc-500">← My projects</span>

      <div className="rounded-xl border border-zinc-200 border-l-[3px] border-l-yellow-400 bg-white p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h1 className="text-base font-semibold text-zinc-900">Site 228, 85 Twists Road, Burpengary East QLD</h1>
          <span className="text-sm text-zinc-400">Stockland</span>
          <span className="self-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Assigned</span>
          <span className="self-center inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Portal</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-zinc-100 pt-3 text-sm text-zinc-500">
          <span>Review cycle <span className="font-medium text-zinc-900">1</span></span>
          <span className="border-l border-zinc-100 pl-5">Submitted <span className="font-medium text-zinc-900">10/07/2026</span></span>
          <span className="border-l border-zinc-100 pl-5">Due <span className="font-medium text-zinc-900">17/07/2026</span></span>
        </div>
      </div>

      <div id="t-stage-rail">
        <StageRail stages={FAKE_STAGES} />
      </div>

      <div className="grid gap-6 md:grid-cols-[22rem_1fr]">
        <div className="min-w-0 space-y-3">
          <div id="t-focus-card">
            <FocusCard tone="neutral" title="Set the project number" subtitle="Unlocks PBDB generation.">
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">DDEG project number</label>
              <input readOnly placeholder="e.g. 25-001" className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm" />
              <div className="mt-3">
                <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Save</button>
              </div>
            </FocusCard>
          </div>

          <div id="t-reference-cards" className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-500">
                #
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Project number</p>
            </div>
            <p className="text-xs text-zinc-400">Not yet set — once it is, it stays here for quick edits.</p>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm font-medium">
            <span className="rounded-md bg-white px-3 py-1.5 shadow-sm text-zinc-900">Details</span>
            <span className="px-3 py-1.5 text-zinc-500">Documents</span>
            <span className="px-3 py-1.5 text-zinc-500">Stakeholders</span>
          </div>
          <FakeInfo />
        </div>
      </div>
    </div>
  );
}

function FakeInfo() {
  const row = (label: string, value: string) => (
    <div className="flex items-baseline gap-4 px-5 py-3">
      <span className="w-36 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{value}</span>
    </div>
  );
  return (
    <>
      <CollapsibleSection title="Submitted details" defaultOpen>
        <div className="divide-y divide-zinc-100">
          {row("PO number", "2116-228/200-075.2")}
          {row("Project Address", "Site 228, 85 Twists Road, Burpengary East QLD")}
          {row("Development Name", "Halcyon Serrata")}
          {row("House Type", "NOVA")}
          {row("Building Plan Date", "30/04/2026")}
          {row("Rainfall intensity", "240")}
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Client contact" defaultOpen>
        <div className="divide-y divide-zinc-100">
          {row("Name", "Jordan Lee")}
          {row("Email", "jordan.lee@stockland.com.au")}
        </div>
      </CollapsibleSection>
    </>
  );
}
