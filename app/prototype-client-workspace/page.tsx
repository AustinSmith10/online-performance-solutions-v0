"use client";

// PROTOTYPE — throwaway, do not ship. Answers: "what should the client's
// report-request → project-detail flow look like if it never left one frame?"
//
// Reuses StageRail / FocusCard from the consultant AltWorkspace (app/(consultant)/ops/projects/[id]/_components)
// so the visual language matches what was just shipped for consultants.
//
// The whole point being demonstrated: submitting the request does NOT navigate
// anywhere. The same header, same rail, same right-hand tabs stay mounted —
// only the FocusCard + rail state change. The "Preview stage" control at the
// top is a demo-only cheat so you can see later stages without waiting on a
// real backend; the "Submit report request" button drives a real local
// transition the same way the real submit would.
//
// Also demonstrates: (1) expected delivery date in the header — shown plainly,
// no overdue indicator, since a client isn't the one who should feel that
// pressure (see NOTES at the bottom of this file), (2) a review-cycle loop —
// "Request changes" bumps the round counter and loops the rail back to a
// "Revising" state instead of a 6th stage, matching how the real
// resolveStepperState()/DeliveryStepper already model revision loops, and
// (3) a compact single-row top nav (replacing the current oversized nav for
// both roles — see NOTES at the bottom of this file).

import { useState } from "react";
import { StageRail, type Stage } from "@/components/workspace/StageRail";
import { FocusCard } from "@/components/workspace/FocusCard";
import { DownloadCard } from "@/components/DownloadCard";

type LifecycleStage = "request" | "reviewing" | "draft_ready" | "finalising" | "delivered";

const STAGE_ORDER: LifecycleStage[] = ["request", "reviewing", "draft_ready", "finalising", "delivered"];

const STAGE_META: Record<LifecycleStage, { label: string; icon: Stage["icon"] }> = {
  request: { label: "Request", icon: "document" },
  reviewing: { label: "Being Prepared", icon: "refresh" },
  draft_ready: { label: "Your Review", icon: "people" },
  finalising: { label: "Finalising", icon: "refresh" },
  delivered: { label: "Delivered", icon: "flag" },
};

function buildStages(current: LifecycleStage, reviewCycle: number): Stage[] {
  const idx = STAGE_ORDER.indexOf(current);
  const isRevising = current === "reviewing" && reviewCycle > 1;
  return STAGE_ORDER.map((key, i) => {
    const revisingThisNode = isRevising && key === "reviewing";
    return {
      id: key,
      label: revisingThisNode ? "Revising" : STAGE_META[key].label,
      icon: revisingThisNode ? "refresh" : STAGE_META[key].icon,
      state: i < idx ? "done" : i === idx ? "current" : "upcoming",
      urgency: i === idx && (key === "draft_ready" || revisingThisNode) ? "amber" : "neutral",
    };
  });
}

type RefTab = "overview" | "documents" | "review";

const REF_TABS: { id: RefTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "review", label: "Review" },
];

const PREVIEW_OPTIONS: { id: LifecycleStage; label: string }[] = [
  { id: "request", label: "New request" },
  { id: "reviewing", label: "Reviewing" },
  { id: "draft_ready", label: "Draft ready" },
  { id: "finalising", label: "Finalising" },
  { id: "delivered", label: "Delivered" },
];

const TEMPLATES = ["Bushfire Attack Level Assessment", "Performance Solution Report", "Section J Compliance"];

// The real app already has a place for this — lib/stakeholders/dispatch.ts reads
// a `revision_notes` row and emails it to the client on re-approval, and
// PbdbVersionsCard.tsx already renders it for the consultant. It just never
// reaches the client's own UI. Keyed by round because a note only exists once
// the consultant has revised something (i.e. round 2+).
const CONSULTANT_NOTE_BY_ROUND: Record<number, string> = {
  2: "Adjusted the setback distance on the north elevation to 6.2m clear of the boundary, per your comment.",
};

type ReviewEvent = { round: number; action: "requested_changes" | "approved"; note: string; date: string };

export default function Page() {
  const [stage, setStage] = useState<LifecycleStage>("request");
  const [template, setTemplate] = useState("");
  const [fileAttached, setFileAttached] = useState(false);
  const [justAdvanced, setJustAdvanced] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewCycle, setReviewCycle] = useState(1);
  const [reviewHistory, setReviewHistory] = useState<ReviewEvent[]>([]);

  const stages = buildStages(stage, reviewCycle);
  const address = "42 Riverside Drive, Docklands VIC";
  const dueDate = "22 Jul 2026";
  const isRevising = stage === "reviewing" && reviewCycle > 1;

  // Demo-bar jumps only reset the round counter when jumping back to a new
  // request — otherwise a round bumped by the real "Request changes" button
  // below stays intact so you can jump ahead and still see round 2+ states.
  function advanceTo(next: LifecycleStage) {
    setStage(next);
    if (next === "request") setReviewCycle(1);
    setJustAdvanced(true);
    window.setTimeout(() => setJustAdvanced(false), 1600);
  }

  function handleSubmitRequest() {
    if (!template || !fileAttached) return;
    advanceTo("reviewing");
  }

  function handleApprove() {
    setReviewHistory((h) => [...h, { round: reviewCycle, action: "approved", note: "", date: "16 Jul 2026" }]);
    setStage("finalising");
    setJustAdvanced(true);
    window.setTimeout(() => setJustAdvanced(false), 1600);
  }

  function handleRequestChanges() {
    setReviewHistory((h) => [...h, { round: reviewCycle, action: "requested_changes", note: reviewNote, date: "16 Jul 2026" }]);
    setReviewCycle((c) => c + 1);
    setReviewNote("");
    setStage("reviewing");
    setJustAdvanced(true);
    window.setTimeout(() => setJustAdvanced(false), 1600);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Demo-only control bar — not part of the design being proposed */}
      <div className="sticky top-0 z-50 border-b border-dashed border-purple-300 bg-purple-50/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            Prototype — preview stage
          </span>
          <div className="flex gap-1 rounded-md bg-white p-0.5 ring-1 ring-purple-200">
            {PREVIEW_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => advanceTo(opt.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  stage === opt.id ? "bg-purple-600 text-white" : "text-purple-700 hover:bg-purple-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-purple-500">
            One continuous frame — the &quot;Submit&quot; button below advances the same way this control does.
          </span>
        </div>
      </div>

      {/* Compact top nav — replaces the header entirely, one row, no wasted
          chrome for 3-4 links. See NOTES at the bottom of this file for why
          this also proposes retiring the consultant's full-height sidebar. */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-11 max-w-5xl items-center gap-5 px-4">
          <span className="text-sm font-semibold text-zinc-900">OPS</span>
          <nav className="flex flex-1 gap-4 text-sm">
            <span className="border-b-2 border-zinc-900 py-1 font-medium text-zinc-900">My Reports</span>
            <span className="border-b-2 border-transparent py-1 text-zinc-500">History</span>
            <span className="border-b-2 border-transparent py-1 text-zinc-500">Recovery</span>
          </nav>
          <button className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100" title="Notifications">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.076c1.35.25 2.71.436 4.084.557a3.5 3.5 0 006.316 0c1.373-.121 2.734-.307 4.084-.557a.75.75 0 00.515-1.076A11.448 11.448 0 0116 8a6 6 0 00-6-6zm0 14.5a2 2 0 01-1.95-1.557 25.7 25.7 0 003.9 0A2 2 0 0110 16.5z" />
            </svg>
          </button>
          <span
            title="Fire Deg"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-700"
          >
            F
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <p className="text-sm text-zinc-500">
          <span className="text-zinc-400">My Reports</span>
          <span className="mx-1.5 text-zinc-300">/</span>
          <span className="text-zinc-700">{stage === "request" ? "New report" : address}</span>
        </p>

        {/* Header status card — present from the very first click, so the client
            lands in the workspace they'll live in for the whole project's life,
            not a bare form. */}
        <div className="rounded-xl border border-l-[3px] border-zinc-200 border-l-blue-400 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-semibold text-zinc-900">
                {stage === "request" ? "New report request" : address}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {stage === "request" ? (
                  "Tell us what you need — we'll set up your workspace as soon as you submit."
                ) : (
                  <>
                    Bushfire Attack Level Assessment · Submitted 14 Jul 2026 · Due{" "}
                    <span className="font-medium text-zinc-700">{dueDate}</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {reviewCycle > 1 && stage !== "request" && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                  Round {reviewCycle}
                </span>
              )}
              {stage !== "request" && (
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                  {isRevising ? "Revising" : STAGE_META[stage].label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Rail + focus card + right tabs are ALWAYS mounted, request stage or not.
            Only their contents change — this is the seamlessness. */}
        <div
          className={`grid grid-cols-1 items-start gap-5 md:grid-cols-[22rem_1fr] transition-opacity duration-300 ${
            justAdvanced ? "opacity-90" : "opacity-100"
          }`}
        >
          <div className="min-w-0 space-y-4 md:sticky md:top-16">
            <StageRail stages={stages} />

            {stage === "request" && (
              <FocusCard tone="neutral" title="Start your request" subtitle="Two things and you're done.">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">
                      Report type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                      <option value="">Select a report type…</option>
                      {TEMPLATES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">
                      Building plans <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setFileAttached((v) => !v)}
                      className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-5 text-center text-sm transition-colors ${
                        fileAttached
                          ? "border-zinc-300 bg-white text-zinc-700"
                          : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-400"
                      }`}
                    >
                      {fileAttached ? (
                        <>
                          <span className="font-medium text-zinc-800">plans-riverside-dr.pdf</span>
                          <span className="text-xs text-zinc-400">Click to remove</span>
                        </>
                      ) : (
                        <>
                          <span>Click or drag to upload</span>
                          <span className="text-xs text-zinc-400">PDF, 50 MB max</span>
                        </>
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={!template || !fileAttached}
                    onClick={handleSubmitRequest}
                    className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Submit report request
                  </button>
                  <p className="text-center text-xs text-zinc-400">
                    You&apos;ll land straight in your project workspace below — nothing to click through.
                  </p>
                </div>
              </FocusCard>
            )}

            {stage === "reviewing" && !isRevising && (
              <FocusCard tone="neutral" title="We're on it" subtitle="Nothing needed from you right now.">
                <p className="text-sm text-zinc-600">
                  Your consultant is assessing the request. You&apos;ll get a notification the moment
                  there&apos;s something for you to review.
                </p>
              </FocusCard>
            )}

            {stage === "reviewing" && isRevising && (
              <FocusCard
                tone="amber"
                title="Applying your requested changes"
                subtitle={`Round ${reviewCycle} · nothing needed from you right now.`}
              >
                <p className="text-sm text-zinc-600">
                  Your consultant is updating the brief based on your comments. You&apos;ll be asked to
                  review again once it&apos;s ready.
                </p>
                {reviewHistory.at(-1)?.note && (
                  <p className="mt-3 rounded-md bg-white/60 px-3 py-2 text-sm italic text-amber-900">
                    &ldquo;{reviewHistory.at(-1)?.note}&rdquo;
                  </p>
                )}
              </FocusCard>
            )}

            {stage === "draft_ready" && (
              <FocusCard
                tone="amber"
                title="Please review the brief"
                subtitle={
                  reviewCycle > 1
                    ? `Round ${reviewCycle} · updated based on your last comments.`
                    : "This is the one step that needs you."
                }
              >
                <div className="space-y-3">
                  {CONSULTANT_NOTE_BY_ROUND[reviewCycle] && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                        Note from your consultant
                      </p>
                      <p className="mt-1 text-sm text-blue-900">{CONSULTANT_NOTE_BY_ROUND[reviewCycle]}</p>
                    </div>
                  )}
                  <a
                    href="#"
                    download
                    onClick={(e) => e.preventDefault()}
                    className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                  >
                    <span className="text-zinc-800">Performance Based Design Brief.pdf</span>
                    <DownloadIcon className="h-4 w-4 text-zinc-400" />
                  </a>
                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Comments (only needed if requesting changes)"
                    rows={2}
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleApprove}
                      className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={handleRequestChanges}
                      className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                    >
                      Request changes
                    </button>
                  </div>
                </div>
              </FocusCard>
            )}

            {stage === "finalising" && (
              <FocusCard tone="neutral" title="Finalising your report" subtitle="Almost there.">
                <p className="text-sm text-zinc-600">
                  Your brief is approved — the final report is being prepared now.
                </p>
              </FocusCard>
            )}

            {stage === "delivered" && (
              <FocusCard tone="green" title="Your report is ready" subtitle="Download it any time from Documents.">
                <a
                  href="#"
                  download
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center justify-between rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50"
                >
                  <span>Performance Based Design Report.pdf</span>
                  <DownloadIcon className="h-4 w-4" />
                </a>
              </FocusCard>
            )}

            {stage !== "request" && (
              <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Reference</p>
                <dl className="space-y-1.5 text-zinc-700">
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Report type</dt>
                    <dd>Bushfire Attack Level Assessment</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Submitted</dt>
                    <dd>14 Jul 2026</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Due</dt>
                    <dd>{dueDate}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">PO number</dt>
                    <dd>{poNumber || "—"}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>

          {/* Right column — pill tabs, present even during "request" so the client
              sees the shape of the workspace they're about to enter. */}
          <RightColumn
            stage={stage}
            address={address}
            poNumber={poNumber}
            setPoNumber={setPoNumber}
            dueDate={dueDate}
            reviewCycle={reviewCycle}
            reviewHistory={reviewHistory}
          />
        </div>
      </main>
    </div>
  );
}

function RightColumn({
  stage,
  address,
  poNumber,
  setPoNumber,
  dueDate,
  reviewCycle,
  reviewHistory,
}: {
  stage: LifecycleStage;
  address: string;
  poNumber: string;
  setPoNumber: (v: string) => void;
  dueDate: string;
  reviewCycle: number;
  reviewHistory: ReviewEvent[];
}) {
  const [tab, setTab] = useState<RefTab>("overview");
  const isRequest = stage === "request";

  return (
    <div className="min-w-0">
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
        {REF_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {tab === "overview" && (
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">What&apos;s happening</h2>
            {isRequest ? (
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Fill in the report type and attach your plans on the left. As soon as you submit,
                this page becomes your project workspace — same tabs, same layout, just filled in with
                your project&apos;s details. No new page to learn.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {{
                    reviewing: "Your consultant is assessing the request and preparing the design brief.",
                    draft_ready: "The design brief is ready — approve it or request changes on the left.",
                    finalising: "Your brief is approved. The final report is being finalised.",
                    delivered: "Your final report has been delivered and is ready to download.",
                  }[stage as Exclude<LifecycleStage, "request">]}
                </p>
                <dl className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100 text-sm">
                  <div className="flex justify-between py-2">
                    <dt className="text-zinc-500">Property</dt>
                    <dd className="text-zinc-900">{address}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-zinc-500">Due</dt>
                    <dd className="text-zinc-900">{dueDate}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-zinc-500">PO number</dt>
                    <dd>
                      <input
                        value={poNumber}
                        onChange={(e) => setPoNumber(e.target.value)}
                        placeholder="Add PO number"
                        className="rounded border border-transparent px-1.5 py-0.5 text-right text-zinc-900 hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                      />
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </div>
        )}

        {tab === "documents" && (
          <>
            {isRequest ? (
              <div className="rounded-lg border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>
                </div>
                <p className="px-5 py-6 text-sm text-zinc-500">
                  Your uploaded plans and the reports we produce will appear here once you submit.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <DocGroupCard
                  icon="document"
                  label="Your files"
                  files={[{ id: "plans", name: "plans-riverside-dr.pdf", date: "14 Jul 2026" }]}
                />
                {stage !== "reviewing" && (
                  <DocGroupCard
                    icon="document"
                    label="PBDB"
                    files={[
                      {
                        id: "pbdb",
                        name: "Performance Based Design Brief.pdf",
                        date: "15 Jul 2026",
                        version: reviewCycle,
                        badge: stage === "draft_ready" ? "Awaiting your review" : undefined,
                        note: CONSULTANT_NOTE_BY_ROUND[reviewCycle],
                      },
                    ]}
                  />
                )}
                {stage === "delivered" && (
                  <DocGroupCard
                    icon="flag"
                    label="PBDR"
                    files={[{ id: "pbdr", name: "Performance Based Design Report.pdf", date: "18 Jul 2026", version: 1 }]}
                  />
                )}
              </div>
            )}
          </>
        )}

        {tab === "review" && (
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Review history</h2>
            {reviewHistory.length === 0 && stage !== "draft_ready" && (
              <p className="mt-2 text-sm text-zinc-500">No review requested yet.</p>
            )}
            {stage === "draft_ready" && (
              <p className="mt-2 text-sm text-zinc-500">
                Round {reviewCycle} pending — respond using the review card on the left.
              </p>
            )}
            {reviewHistory.length > 0 && (
              <ul className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
                {reviewHistory.map((ev, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-900">
                        Round {ev.round} —{" "}
                        {ev.action === "approved" ? (
                          <span className="text-emerald-700">Approved</span>
                        ) : (
                          <span className="text-amber-700">Changes requested</span>
                        )}
                      </span>
                      <span className="text-xs text-zinc-400">{ev.date}</span>
                    </div>
                    {ev.note && <p className="mt-1 italic text-zinc-600">&ldquo;{ev.note}&rdquo;</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12.5a.75.75 0 00.75-.75V4.75a.75.75 0 00-1.5 0v6.69L7.03 9.22a.75.75 0 10-1.06 1.06l3.5 3.5a.75.75 0 001.06 0l3.5-3.5a.75.75 0 10-1.06-1.06L10.75 11.5V4.75A.75.75 0 0010 4v8.5z" />
      <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
  );
}

// Document card — this is deliberately a straight copy of the consultant's
// PbdbVersionsCard (app/(consultant)/ops/projects/[id]/_components/PbdbVersionsCard.tsx):
// same icon-badge + uppercase label header, same zinc-50 row per file with a
// version pill + date, same real DownloadCard for the actual download button.
// The client's Documents tab was previously a bare filename/date list with no
// visible affordance — this makes every file look and behave exactly like the
// PBDB rows a consultant already sees.
function DocGroupCard({
  icon,
  label,
  files,
}: {
  icon: "document" | "flag";
  label: string;
  files: { id: string; name: string; date: string; version?: number; badge?: string; note?: string }[];
}) {
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
              href="#"
              filename={f.name}
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

// NOTES
//
// Nav bar size: today the consultant gets a persistent full-height left
// sidebar (components/ConsultantSidebar.tsx) that's 224px wide expanded /
// 56px collapsed, for exactly 2 links (Workspace, Availability) — the
// layout file even says so in a comment. The client gets a full h-14 header
// row for 3 links. Neither has enough items, hierarchy, or per-item content
// (counts/badges) to earn a dedicated rail — a sidebar pays for itself past
// ~6-8 items or nested sections, not 2-4 flat links.
//
// Recommendation demonstrated above: retire ConsultantSidebar entirely and
// give both roles the same compact single-row top bar (h-11, underlined
// active tab, icon-only notifications + avatar). This (a) recovers the full
// 224px of horizontal space for the consultant's workspace grid, which
// already wants md:grid-cols-[22rem_1fr] and is currently fighting the
// sidebar for room, and (b) means client and consultant share one nav
// component instead of two maintained in parallel.
//
// Review cycles: reviewCycle/reviewHistory above mirror how
// lib/delivery/stepper.ts already models this for the real DeliveryStepper —
// "Request changes" doesn't add a 6th stage, it loops the existing
// "Being Prepared" stage back to a distinct "Revising" state and bumps a
// round counter (shown as a "Round N" pill in the header and FocusCard, and
// logged in the Review tab's history). Approving always moves forward
// regardless of which round it happened on.
