"use client";

// PROTOTYPE — throwaway, do not ship. Answers: "what should the four new
// streaming progress bars (download / upload+extraction / PBDB+PBDR /
// previewer) look like and feel like to click through?" — see grilling
// session for the underlying design decisions (transport per feature, why
// each mechanism was chosen). No real backend wiring here: every async step
// is a setTimeout standing in for the real stream-read / poll / render loop.
//
// Visual language borrowed from what's already in production so this reads
// as native, not generic: the thin h-1.5 rounded-full track + inner fill bar
// from components/UploadDropzone.tsx, the FileSlot-style card row from
// app/(client)/portal/submit/_components/FileSlot.tsx, the download-card
// shape from components/GeneratedPbdbDownload.tsx, and the local Spinner
// from app/(client)/portal/submit/_components/shared.tsx.
//
// Four features, not four variants of one question — the switcher below
// cycles between them rather than between competing designs of the same
// screen.

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FeatureKey = "download" | "upload" | "generate" | "preview";

const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: "download", label: "Download" },
  { key: "upload", label: "Upload + extraction" },
  { key: "generate", label: "Generate / convert" },
  { key: "preview", label: "Previewer" },
];

export default function PrototypeProgressBars() {
  const router = useRouter();
  const params = useSearchParams();
  const current = (params.get("feature") as FeatureKey) ?? "download";
  const idx = FEATURES.findIndex((f) => f.key === current);
  const safeIdx = idx === -1 ? 0 : idx;

  function go(next: number) {
    const wrapped = (next + FEATURES.length) % FEATURES.length;
    router.replace(`?feature=${FEATURES[wrapped].key}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.getAttribute("contenteditable");
      if (typing) return;
      if (e.key === "ArrowLeft") go(safeIdx - 1);
      if (e.key === "ArrowRight") go(safeIdx + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIdx]);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12">
      <div className="mx-auto max-w-lg">
        <p className="mb-6 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Prototype — {FEATURES[safeIdx].label}
        </p>

        {current === "download" && <DownloadDemo />}
        {current === "upload" && <UploadExtractionDemo />}
        {current === "generate" && <GenerateConvertDemo />}
        {current === "preview" && <PreviewerDemo />}
      </div>

      {process.env.NODE_ENV !== "production" && (
        <FeatureSwitcher current={safeIdx} onPrev={() => go(safeIdx - 1)} onNext={() => go(safeIdx + 1)} />
      )}
    </div>
  );
}

function FeatureSwitcher({ current, onPrev, onNext }: { current: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-6 flex justify-center">
      <div className="flex items-center gap-3 rounded-full border border-zinc-900 bg-zinc-900 px-4 py-2 text-white shadow-lg">
        <button onClick={onPrev} className="px-1 text-lg leading-none" aria-label="Previous feature">
          ←
        </button>
        <span className="text-xs font-medium">
          {current + 1}/{FEATURES.length} — {FEATURES[current].label}
        </span>
        <button onClick={onNext} className="px-1 text-lg leading-none" aria-label="Next feature">
          →
        </button>
      </div>
    </div>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.291l3-3.291z"
      />
    </svg>
  );
}

function ProgressTrack({ pct, tone = "green" }: { pct: number; tone?: "green" | "zinc" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
      <div
        className={`h-full rounded-full transition-[width] duration-200 ${tone === "green" ? "bg-green-500" : "bg-zinc-900"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// 1. Download — the native <a href download> click stays untouched (a fetch
// + getReader() swap was already tried and reverted in this codebase, see
// components/GeneratedPbdbDownload.tsx's comment — the synthetic click can
// silently drop the download in some browsers). Instead the click also kicks
// off polling a small per-request status endpoint that reports bytes served
// so far, replacing DownloadCard's current fixed-timer wash/checkmark with a
// real % during the wash phase.
type DownloadPhase = "idle" | "downloading" | "confirmed";

function useSimulatedDownload() {
  const [phase, setPhase] = useState<DownloadPhase>("idle");
  const [pct, setPct] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function start() {
    if (phase === "downloading") return;
    setPhase("downloading");
    setPct(0);
    timer.current = setInterval(() => {
      setPct((p) => {
        const next = p + Math.random() * 20 + 10;
        if (next >= 100) {
          if (timer.current) clearInterval(timer.current);
          setPhase("confirmed");
          setTimeout(() => setPhase("idle"), 2000);
          return 100;
        }
        return next;
      });
    }, 150);
  }

  return { phase, pct, start };
}

function DownloadDemo() {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Versions list</p>
        <VersionsListDemo />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Single-file card</p>
        <SingleCardDemo />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Compact inline pill (hero, 1 ready)</p>
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <CompactPill filename="report.pdf" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Expandable list + download all (hero, 2+ ready)</p>
        <ExpandableListDemo />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Approval form — download brief</p>
        <ApprovalBriefDemo />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Documents tab row (preview + download)</p>
        <DocumentsRowDemo />
      </div>
    </div>
  );
}

// Compact inline pill — no card wrapper, the pill itself becomes the % readout.
function CompactPill({ filename, onDone }: { filename: string; onDone?: () => void }) {
  const { phase, pct, start } = useSimulatedDownload();
  const done = phase === "confirmed";

  return (
    <button
      onClick={() => {
        start();
        if (onDone) setTimeout(onDone, 1600);
      }}
      disabled={phase === "downloading"}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        done
          ? "bg-green-600 text-white"
          : phase === "downloading"
            ? "border border-green-300 bg-green-50 text-green-800"
            : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
      title={filename}
    >
      {done ? "Downloaded ✓" : phase === "downloading" ? `${Math.round(pct)}%` : "Download"}
    </button>
  );
}

// Expandable multi-download list — "Download all" fires each row's download
// one at a time (matches the real downloadAllSequentially staggered-click
// behavior); only the active row's pill shows progress at any moment.
const HERO_FILES = ["159159-S_PBDR.pdf", "159162-C_PBDR.pdf", "159170-B_PBDR.pdf"];

function ExpandableListDemo() {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [completed, setCompleted] = useState<number[]>([]);

  function downloadAll() {
    setCompleted([]);
    setActiveIdx(0);
  }

  function onRowDone(idx: number) {
    setCompleted((c) => [...c, idx]);
    if (idx + 1 < HERO_FILES.length) {
      setActiveIdx(idx + 1);
    } else {
      setActiveIdx(null);
    }
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Download ({HERO_FILES.length}) {open ? "▲" : "▼"}
        </button>
        {open && (
          <button
            onClick={downloadAll}
            disabled={activeIdx !== null}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            Download all
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 divide-y divide-zinc-100 border-t border-zinc-100">
          {HERO_FILES.map((f, i) => (
            <div key={f} className="flex items-center justify-between gap-2 py-2">
              <p className="min-w-0 truncate text-xs text-zinc-700">{f}</p>
              {activeIdx === i ? (
                <ActiveRowPill filename={f} onDone={() => onRowDone(i)} />
              ) : completed.includes(i) ? (
                <span className="shrink-0 rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white">
                  Downloaded ✓
                </span>
              ) : (
                <CompactPill filename={f} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveRowPill({ filename, onDone }: { filename: string; onDone: () => void }) {
  const { phase, pct, start } = useSimulatedDownload();
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "confirmed") {
      const t = setTimeout(onDone, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <span
      className="shrink-0 rounded-full border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800"
      title={filename}
    >
      {phase === "confirmed" ? "Downloaded ✓" : `${Math.round(pct)}%`}
    </span>
  );
}

// Approval form — amber-tinted "Download brief" card above the approve/reject form.
function ApprovalBriefDemo() {
  const { phase, pct, start } = useSimulatedDownload();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-900">Project brief document (PBDB)</p>
          {phase !== "idle" && (
            <div className="mt-2 w-40">
              <ProgressTrack pct={phase === "confirmed" ? 100 : pct} />
            </div>
          )}
        </div>
        <button
          onClick={start}
          disabled={phase === "downloading"}
          className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {phase === "confirmed" ? "Downloaded ✓" : phase === "downloading" ? `${Math.round(pct)}%` : "Download brief"}
        </button>
      </div>
      <div className="flex gap-2 opacity-50">
        <button disabled className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700">
          Approve
        </button>
        <button disabled className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700">
          Request changes
        </button>
      </div>
    </div>
  );
}

// Documents tab row — Preview and Download as two side-by-side actions per file.
function DocumentsRowDemo() {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="rounded-md bg-zinc-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium text-zinc-900">site-plan-rev-c.pdf</p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setPreviewOpen((v) => !v)}
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            {previewOpen ? "Hide preview" : "Preview"}
          </button>
          <CompactPill filename="site-plan-rev-c.pdf" />
        </div>
      </div>
      {previewOpen && (
        <div className="mt-2.5">
          <MiniPreviewer />
        </div>
      )}
    </div>
  );
}

const VERSION_ROWS = [
  { id: "1", filename: "159159-S PBDB Rev0 Site 350, 16-32 Caulfield St.docx", version: 1, date: "06/08/2026" },
  { id: "2", filename: "159159-S PBDB Rev0 Site 350, 16-32 Caulfield St.docx", version: 2, date: "06/08/2026" },
  {
    id: "3",
    filename: "159159-S PBDB Rev1 Site 350, 16-32 Caulfield St.docx",
    version: 3,
    date: "06/08/2026",
    note: "testing revision number and history table",
  },
  {
    id: "4",
    filename: "159159-S PBDB Rev2 Site 350, 16-32 Caulfield St.docx",
    version: 4,
    date: "06/08/2026",
    note: "realtime test",
  },
  {
    id: "5",
    filename: "159159-S PBDB Rev3 Site 350, 16-32 Caulfield St.docx",
    version: 5,
    date: "06/08/2026",
    note: "done",
    dispatched: true,
  },
];

function VersionsListDemo() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.914a2 2 0 00-.586-1.414l-3.914-3.914A2 2 0 0012.086 2H4zm7 1.5V6a1 1 0 001 1h2.5L11 3.5zM6 9a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">PBDB</p>
      </div>

      <div className="space-y-1.5">
        {VERSION_ROWS.map((row) => (
          <div key={row.id} className="space-y-1">
            <VersionRow {...row} />
            {row.note && <p className="px-3 text-[11px] leading-relaxed text-zinc-500">{row.note}</p>}
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-zinc-100 pt-3">
        <p className="text-[11px] leading-relaxed text-zinc-400">Only available before the PBDB is dispatched.</p>
      </div>
    </div>
  );
}

function VersionRow({
  filename,
  version,
  date,
  dispatched,
}: {
  filename: string;
  version: number;
  date: string;
  dispatched?: boolean;
}) {
  const { phase, pct, start } = useSimulatedDownload();

  return (
    <div className="relative overflow-hidden rounded-lg bg-zinc-50 px-3 py-2">
      {phase !== "idle" && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[3px] transition-all duration-200 ${
            phase === "confirmed" ? "bg-green-500" : "bg-green-400"
          }`}
          style={{ width: `${phase === "confirmed" ? 100 : pct}%` }}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-zinc-900" title={filename}>
            {filename}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="shrink-0 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
              v{version}
            </span>
            <span className="text-[11px] text-zinc-400">{date}</span>
            {dispatched && (
              <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                Dispatched
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {phase === "downloading" && <span className="text-[11px] font-medium text-green-700">{Math.round(pct)}%</span>}
          {phase === "confirmed" && <span className="text-[11px] font-medium text-green-700">Downloaded ✓</span>}
          <button
            onClick={start}
            className="shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

function SingleCardDemo() {
  const { phase, pct, start } = useSimulatedDownload();

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-green-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900">159159-S_PBDB_Rev3.docx</p>
        <p className="mt-0.5 text-xs text-zinc-500">v5 · 06/08/2026</p>
        {phase !== "idle" && (
          <div className="mt-2 w-40">
            <ProgressTrack pct={phase === "confirmed" ? 100 : pct} />
          </div>
        )}
      </div>
      {phase === "idle" && (
        <button
          onClick={start}
          className="shrink-0 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
        >
          Download
        </button>
      )}
      {phase === "downloading" && (
        <span className="shrink-0 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800">
          {Math.round(pct)}%
        </span>
      )}
      {phase === "confirmed" && (
        <span className="shrink-0 rounded-full bg-green-600 px-2.5 py-1 text-xs font-semibold text-white">
          Downloaded ✓
        </span>
      )}
    </div>
  );
}

// 2. Upload / extraction — dropzone per document type (matches the reference
// screenshot / components/UploadDropzone.tsx), discrete step jumps, plus the
// flag-gate branch: extraction only runs once Checking confirms a match —
// otherwise it halts on "Needs review" and waits for the user to confirm or
// reupload rather than auto-proceeding to Extracting.
type UploadPhase = "idle" | "uploading" | "checking" | "needs_review" | "extracting" | "ready";

const PHASE_META: Record<Exclude<UploadPhase, "idle">, { label: string; pct: number; tone: string }> = {
  uploading: { label: "Uploading", pct: 25, tone: "text-zinc-500" },
  checking: { label: "Checking", pct: 50, tone: "text-zinc-500" },
  needs_review: { label: "Needs review", pct: 50, tone: "text-amber-700" },
  extracting: { label: "Extracting", pct: 75, tone: "text-amber-700" },
  ready: { label: "Ready", pct: 100, tone: "text-green-700" },
};

const MISMATCH_REASONS = [
  "Missing required text: \"ISSUED FOR CONSTRUCTION\"",
  "AI check: document doesn't look like a construction issue drawing",
];

function UploadDropzoneDemo({
  label,
  outcome,
  onDone,
}: {
  label: string;
  outcome: "clean" | "mismatch";
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const running = phase === "uploading" || phase === "checking" || phase === "extracting";

  function start() {
    if (running) return;
    setFileName(outcome === "mismatch" ? "purchase-order-old.pdf" : "purchase-order.pdf");
    setPhase("uploading");
    setTimeout(() => {
      setPhase("checking");
      setTimeout(() => {
        if (outcome === "mismatch") {
          setPhase("needs_review");
          return;
        }
        setPhase("extracting");
        setTimeout(() => {
          setPhase("ready");
          onDone?.();
        }, 1200);
      }, 1200);
    }, 1200);
  }

  function confirmAndExtract() {
    setPhase("extracting");
    setTimeout(() => {
      setPhase("ready");
      onDone?.();
    }, 1200);
  }

  function reupload() {
    setPhase("idle");
    setFileName(null);
  }

  const meta = phase === "idle" ? null : PHASE_META[phase];

  return (
    <div>
      <p className="mb-1.5 text-sm text-zinc-700">
        {label} <span className="text-red-500">*</span>
      </p>

      {phase === "idle" ? (
        <button
          onClick={start}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center hover:border-zinc-400 hover:bg-zinc-100"
        >
          <span className="text-sm text-zinc-500">Click or drag to upload {label.toLowerCase()}</span>
          <span className="text-xs text-zinc-400">PDF, 50 MB each</span>
        </button>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">{fileName}</p>
              {meta && (
                <p className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${meta.tone}`}>
                  {running && <Spinner className="h-3 w-3" />}
                  {meta.label}
                </p>
              )}
            </div>
            {phase === "ready" && (
              <button
                onClick={reupload}
                className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Reset
              </button>
            )}
          </div>

          {meta && (
            <div className="mt-2.5">
              <ProgressTrack pct={meta.pct} />
            </div>
          )}

          {phase === "needs_review" && (
            <div className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                {MISMATCH_REASONS.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={() => setPreviewOpen((v) => !v)}
                  className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {previewOpen ? "Hide preview" : "Preview"}
                </button>
                <button
                  onClick={confirmAndExtract}
                  className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Yes, this is the right file
                </button>
                <button
                  onClick={reupload}
                  className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Remove
                </button>
              </div>
              {previewOpen && (
                <div className="mt-2.5">
                  <MiniPreviewer />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Inline previewer for a flagged file's "Preview" action — same mechanism as
// feature #4 (pagesRendered/totalPages, no per-page tiles), auto-starts as
// soon as it mounts since the user just asked to see the file.
function MiniPreviewer() {
  const totalPages = 3;
  const [rendered, setRendered] = useState(0);

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setRendered(i);
      if (i >= totalPages) clearInterval(iv);
    }, 350);
    return () => clearInterval(iv);
  }, []);

  const pct = Math.round((rendered / totalPages) * 100);

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex h-32 items-center justify-center overflow-hidden rounded-md bg-zinc-100">
        {rendered < totalPages ? (
          <Spinner className="h-5 w-5 text-zinc-400" />
        ) : (
          <div className="h-28 w-20 rounded border border-zinc-300 bg-white shadow-sm">
            <div className="space-y-1 p-2">
              <div className="h-1.5 w-3/4 rounded-sm bg-zinc-200" />
              <div className="h-1.5 w-full rounded-sm bg-zinc-200" />
              <div className="h-1.5 w-5/6 rounded-sm bg-zinc-200" />
            </div>
          </div>
        )}
      </div>
      {rendered < totalPages && (
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>{`Rendering page ${rendered} of ${totalPages}`}</span>
            <span>{pct}%</span>
          </div>
          <ProgressTrack pct={pct} />
        </div>
      )}
    </div>
  );
}

function UploadExtractionDemo() {
  return (
    <div className="space-y-5">
      <UploadDropzoneDemo label="Purchase order" outcome="clean" />
      <UploadDropzoneDemo label="Construction issue drawing" outcome="mismatch" />
    </div>
  );
}

// 3. PBDB generation / PBDR conversion — numeric-only %, chunked jumps, no
// smoothing. Three real variants, each matching its production component's
// actual copy/flow: GeneratePbdbButton (plain, no confirm), RegeneratePbdbButton
// (confirm modal) and ConvertButton (confirm modal + "cannot be undone" warning).
const CHUNK_MILESTONES = [20, 40, 70, 90, 100];

function useChunkedProgress() {
  const [pct, setPct] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  function run(onFinish?: () => void) {
    let i = 0;
    setDone(false);
    setPct(CHUNK_MILESTONES[0]);
    const iv = setInterval(() => {
      i += 1;
      if (i >= CHUNK_MILESTONES.length) {
        clearInterval(iv);
        setDone(true);
        onFinish?.();
        return;
      }
      setPct(CHUNK_MILESTONES[i]);
    }, 700);
  }

  return { pct, done, running: pct !== null && !done, run };
}

function WarningModal({
  heading,
  body,
  pendingLabel,
  pending,
  pct,
  error,
  onCancel,
  onConfirm,
}: {
  heading: string;
  body: string;
  pendingLabel: string;
  pending: boolean;
  pct: number | null;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-md bg-zinc-100 p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-6 w-6 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <p className="text-base font-semibold text-zinc-900">{heading}</p>
        <p className="mt-2 text-sm text-zinc-500">{body}</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {pending && pct !== null && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-zinc-500">
              <span>{pendingLabel}</span>
              <span>{pct}%</span>
            </div>
            <ProgressTrack pct={pct} tone="zinc" />
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={pending}
            className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? pendingLabel : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerateFirstDemo() {
  const { pct, done, running, run } = useChunkedProgress();

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium text-zinc-900">First-time generate (no confirm)</p>
      <button
        onClick={() => run()}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {running && <Spinner className="h-4 w-4" />}
        {done ? "Generate PBDB" : running ? "Generating…" : "Generate PBDB"}
      </button>
      {pct !== null && (
        <div className="mt-3 w-56">
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>{done ? "Complete" : "Generating…"}</span>
            <span>{done ? 100 : pct}%</span>
          </div>
          <ProgressTrack pct={done ? 100 : pct} tone="zinc" />
        </div>
      )}
    </div>
  );
}

function RegenerateDemo() {
  const { pct, done, running, run } = useChunkedProgress();
  const [confirming, setConfirming] = useState(false);
  const [dispatched, setDispatched] = useState(false);

  useEffect(() => {
    if (done) setConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-900">Regenerate (confirm modal)</p>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          <input type="checkbox" checked={dispatched} onChange={(e) => setDispatched(e.target.checked)} />
          Project already dispatched
        </label>
      </div>

      {dispatched ? (
        <p className="text-xs text-zinc-400">Only available before the PBDB is dispatched.</p>
      ) : confirming ? (
        <WarningModal
          heading="Regenerate PBDB?"
          body="This will create a new version of the PBDB. Existing versions will be kept."
          pendingLabel="Regenerating…"
          pending={running}
          pct={pct}
          onCancel={() => setConfirming(false)}
          onConfirm={() => run()}
        />
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Regenerate PBDB
        </button>
      )}
      {done && <p className="mt-3 text-sm font-medium text-green-700">New PBDB version created.</p>}
    </div>
  );
}

const DELAY_PRESETS = ["Expedited", "Normal", "Extended"] as const;

function ConvertDeliverDemo() {
  const { pct, done, running, run } = useChunkedProgress();
  const [confirming, setConfirming] = useState(false);
  const [preset, setPreset] = useState<(typeof DELAY_PRESETS)[number]>("Normal");
  const [simulateGateFailure, setSimulateGateFailure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);

  const staged = preset === "Extended";

  function onConfirm() {
    setError(null);
    // Gate check only runs synchronously on the immediate-delivery path — a
    // staged/extended delivery's gate check happens later in the worker cron,
    // so clicking Convert can still "succeed" (show scheduled) even if the
    // gate would later fail.
    if (!staged && simulateGateFailure) {
      setError("Not all stakeholders have acknowledged.");
      return;
    }
    run(() => {
      if (staged) setScheduledFor("15 Aug 2026, 9:00 am");
    });
  }

  useEffect(() => {
    if (done) setConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium text-zinc-900">Convert &amp; deliver (confirm + cannot-be-undone warning)</p>

      {!done && (
        <div className="mb-3 flex flex-wrap items-center gap-4 border-b border-zinc-100 pb-3">
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            Delivery timing
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as (typeof DELAY_PRESETS)[number])}
              className="rounded-md border border-zinc-200 px-1.5 py-1 text-xs text-zinc-700"
            >
              {DELAY_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={simulateGateFailure}
              onChange={(e) => setSimulateGateFailure(e.target.checked)}
            />
            Simulate gate failure (only applies when not staged)
          </label>
        </div>
      )}

      {confirming ? (
        <WarningModal
          heading="Convert & deliver PBDR?"
          body="This generates the final PBDR and emails it to the stakeholders, applying the delivery timing selected above. This action cannot be undone."
          pendingLabel="Converting…"
          pending={running}
          pct={pct}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={onConfirm}
        />
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Convert &amp; deliver PBDR
        </button>
      )}

      {/* Matches the real bug: state.error is action state, not tied to the
          modal — closing the modal after a failed submit leaves it visible
          below the button rather than clearing it. */}
      {error && !confirming && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {done && (
        <p className="mt-3 text-sm font-medium text-green-700">
          {staged ? `Delivery scheduled for ${scheduledFor}.` : "PBDR delivered. Project marked complete."}
        </p>
      )}
    </div>
  );
}

function GenerateConvertDemo() {
  return (
    <div className="space-y-4">
      <GenerateFirstDemo />
      <RegenerateDemo />
      <ConvertDeliverDemo />
    </div>
  );
}

// 4. Previewer — client-side pagesRendered/totalPages, no network. No
// per-page tiles: a 29-page (or longer) document would blow out the layout
// with individual thumbnails, so this scales the same way regardless of
// document length — just the running count + a % bar. Also covers the two
// fallback paths that aren't the happy path: a render error (PDF.js throws
// mid-render) and an unsupported file type (docx/TIFF — never attempts a
// render at all, detected before anything mounts), plus the modal-vs-inline
// context distinction: DocumentPreviewModal gates its trigger behind
// isPreviewable(), so the unsupported fallback panel is unreachable through
// the modal — only the inline FileSlot usage can ever show it.
type PreviewOutcome = "6pg" | "29pg" | "error" | "unsupported";
type PreviewState = "idle" | "loading" | "ready" | "error" | "unsupported";

function PreviewerDemo() {
  const [context, setContext] = useState<"inline" | "modal">("inline");
  const [modalOpen, setModalOpen] = useState(false);
  const [outcome, setOutcome] = useState<PreviewOutcome>("6pg");
  const [state, setState] = useState<PreviewState>("idle");
  const [totalPages, setTotalPages] = useState(6);
  const [rendered, setRendered] = useState(0);

  function trigger(next: PreviewOutcome) {
    if (context === "modal") setModalOpen(true);
    runPreview(next);
  }

  function runPreview(next: PreviewOutcome) {
    setOutcome(next);
    if (next === "unsupported") {
      // Detected before any render is attempted — no loading state at all.
      setState("unsupported");
      return;
    }
    const pages = next === "29pg" ? 29 : 6;
    setTotalPages(pages);
    setRendered(0);
    setState("loading");
    let i = 0;
    const failAt = next === "error" ? Math.ceil(pages / 2) : null;
    const iv = setInterval(() => {
      i += 1;
      if (failAt !== null && i >= failAt) {
        clearInterval(iv);
        setState("error");
        return;
      }
      setRendered(i);
      if (i >= pages) {
        clearInterval(iv);
        setState("ready");
      }
    }, pages > 10 ? 90 : 400);
  }

  const pct = Math.round((rendered / totalPages) * 100);
  const filename = outcome === "unsupported" ? "site-survey.tiff" : outcome === "29pg" ? "construction-issue-set.pdf" : "site-plan-rev-c.pdf";

  const body = (
    <div>
      <div className="mt-3 flex h-56 items-center justify-center overflow-hidden rounded-md bg-zinc-100">
        {state === "idle" && <span className="text-xs text-zinc-400">No preview loaded</span>}
        {state === "loading" && <Spinner className="h-6 w-6 text-zinc-400" />}
        {state === "ready" && (
          <div className="h-48 w-36 rounded border border-zinc-300 bg-white shadow-sm">
            <div className="space-y-1.5 p-3">
              <div className="h-2 w-3/4 rounded-sm bg-zinc-200" />
              <div className="h-2 w-full rounded-sm bg-zinc-200" />
              <div className="h-2 w-5/6 rounded-sm bg-zinc-200" />
              <div className="h-2 w-2/3 rounded-sm bg-zinc-200" />
            </div>
          </div>
        )}
        {(state === "error" || state === "unsupported") && (
          <div className="text-center">
            <p className="text-xs text-zinc-500">
              {state === "error" ? "Couldn't render this PDF." : "Preview not available for this file format."}
            </p>
            <a href="#" onClick={(e) => e.preventDefault()} className="mt-1 inline-block text-xs font-medium text-blue-600 hover:underline">
              Download instead
            </a>
          </div>
        )}
      </div>

      {state === "loading" && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>{`Rendering page ${rendered} of ${totalPages}`}</span>
            <span>{pct}%</span>
          </div>
          <ProgressTrack pct={pct} />
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          Context
          <select
            value={context}
            onChange={(e) => {
              setContext(e.target.value as "inline" | "modal");
              setModalOpen(false);
              setState("idle");
            }}
            className="rounded-md border border-zinc-200 px-1.5 py-1 text-xs text-zinc-700"
          >
            <option value="inline">Inline (FileSlot)</option>
            <option value="modal">Modal (DocumentPreviewModal)</option>
          </select>
        </label>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-zinc-900">{filename}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => trigger("6pg")} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              Preview 6pg
            </button>
            <button onClick={() => trigger("29pg")} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              Preview 29pg
            </button>
            <button onClick={() => trigger("error")} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              Simulate render error
            </button>
            {context === "inline" ? (
              <button onClick={() => trigger("unsupported")} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                Preview unsupported file
              </button>
            ) : (
              <span className="self-center text-xs text-zinc-400" title="isPreviewable() gates the trigger — an unsupported file never gets a Preview button in the modal context">
                (unsupported file — no Preview button shown)
              </span>
            )}
          </div>
        </div>

        {context === "inline" && body}
      </div>

      {context === "modal" && modalOpen && (
        <div className="mt-3 flex min-h-[360px] items-center justify-center rounded-md bg-zinc-100 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
              <p className="truncate text-sm font-medium text-zinc-900">{filename}</p>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setState("idle");
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
              >
                Close
              </button>
            </div>
            <div className="p-4">{body}</div>
          </div>
        </div>
      )}
    </div>
  );
}
