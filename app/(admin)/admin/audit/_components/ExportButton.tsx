"use client";

import { useState } from "react";

const CLASS =
  "press inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10";

// Downloads through fetch so a slow export (the PDF can take a while) shows a
// pending state instead of a dead-looking click. One request, so the server
// still logs exactly one export.
export function ExportButton({
  href,
  label,
  title,
}: {
  href: string;
  label: string;
  title?: string;
}) {
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");

  async function handleClick() {
    setState("pending");
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? "audit-log";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={state === "pending"}
        aria-busy={state === "pending"}
        title={title}
        className={CLASS}
      >
        {state === "pending" ? "Preparing…" : label}
      </button>
      {state === "error" && (
        <p role="alert" className="text-xs text-red-700">
          Export failed. Try again.
        </p>
      )}
    </div>
  );
}
