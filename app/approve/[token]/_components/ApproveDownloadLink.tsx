"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";

interface Props {
  href: string;
  filename?: string | null;
  /** When set, shows a "Preview" button that renders the brief in-browser. */
  previewHref?: string | null;
}

const CONFIRM_DELAY_MS = 1500;
const FADE_DELAY_MS = 2000;

export function ApproveDownloadLink({ href, filename, previewHref }: Props) {
  const [phase, setPhase] = useState<"idle" | "wash" | "confirmed">("idle");
  const [downloaded, setDownloaded] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
    };
  }, []);

  function handleClick() {
    setDownloaded(true);
    setPhase("wash");
    timers.current.push(
      setTimeout(() => setPhase("confirmed"), CONFIRM_DELAY_MS),
      setTimeout(() => setPhase("idle"), CONFIRM_DELAY_MS + FADE_DELAY_MS)
    );
  }

  const backgroundColor =
    phase === "wash" ? "#dcfce7" : phase === "confirmed" ? "#bbf7d0" : "#ffffff";

  return (
    <div
      style={{
        marginBottom: "24px",
        padding: "14px 16px",
        borderRadius: "8px",
        border: "1px solid #e4e4e7",
        backgroundColor,
        transition: "background-color 0.5s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {previewHref && (
          <DocumentPreviewModal
            href={previewHref}
            filename={filename}
            buttonLabel="Preview"
            buttonClassName="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
          />
        )}
        <a
          href={href}
          onClick={handleClick}
          style={{ color: "#18181b", fontWeight: 500, fontSize: "14px" }}
        >
          Download PBDB document
        </a>
        {downloaded && (
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#15803d" }}>Downloaded ✓</span>
        )}
      </div>
      {phase === "confirmed" && (
        <p style={{ margin: "6px 0 0", fontSize: "13px", fontWeight: 600, color: "#15803d" }}>
          Download started — check your Downloads folder.
        </p>
      )}
      {filename && (
        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#a1a1aa" }}>{filename}</p>
      )}
    </div>
  );
}
