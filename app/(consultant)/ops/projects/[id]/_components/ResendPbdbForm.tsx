"use client";

import { useActionState, useRef, useState } from "react";
import { resendPbdb, type ResendPbdbState } from "@/app/actions/projects";

type Phase = "idle" | "confirming";

export function ResendPbdbForm({
  projectId,
  stakeholderCount,
}: {
  projectId: string;
  stakeholderCount: number;
}) {
  const boundAction = resendPbdb.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ResendPbdbState, FormData>(
    boundAction,
    {}
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputRef.current.files = dt.files;
      setFileName(file.name);
    }
  }

  function handleConfirm() {
    setPhase("idle");
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={formAction} className="space-y-3">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-6 text-center transition-colors ${
            dragOver
              ? "border-zinc-400 bg-zinc-50"
              : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          {fileName ? (
            <p className="text-sm font-medium text-zinc-800">{fileName}</p>
          ) : (
            <>
              <p className="text-sm text-zinc-600">
                Drop corrected .docx here or{" "}
                <span className="font-medium text-zinc-900 underline underline-offset-2">
                  browse
                </span>
              </p>
              <p className="mt-1 text-xs text-zinc-400">.docx only</p>
            </>
          )}
        </div>
        <p className="text-xs text-amber-700">
          Uploading will reset all {stakeholderCount} pending review
          {stakeholderCount !== 1 ? "s" : ""} and resend approval emails with the
          updated document.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending || !fileName}
            onClick={() => setPhase("confirming")}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {pending ? "Uploading…" : "Upload and resend to all stakeholders"}
          </button>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        </div>
      </form>

      {phase === "confirming" && !pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-amber-200 bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-6 w-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-center text-base font-semibold text-zinc-900">Resend PBDB to all stakeholders?</p>
            <p className="mt-2 text-center text-sm text-zinc-500">
              This will reset {stakeholderCount} stakeholder review{stakeholderCount !== 1 ? "s" : ""} and send new approval emails with the updated document.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Yes, resend to all stakeholders
              </button>
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
