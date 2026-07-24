"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { createPortal } from "react-dom";
import { reuploadTemplate, type ReuploadTemplateState } from "@/app/actions/templates";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { UploadDropzone } from "@/components/UploadDropzone";

export function ReuploadForm({ templateId }: { templateId: string }) {
  const action = reuploadTemplate.bind(null, templateId);
  const [state, formAction, pending] = useActionState<ReuploadTemplateState, FormData>(
    action,
    {}
  );
  const [hasFile, setHasFile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedInputRef = useRef<HTMLInputElement>(null);
  useUnsavedChanges("reupload", hasFile);

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (state.success) setHasFile(false);
    if ((state.success || state.error) && confirmedInputRef.current) {
      confirmedInputRef.current.value = "";
    }
    setDismissed(false);
  }, [state]);

  const conflicts = state.conflicts ?? [];
  const showConflicts = conflicts.length > 0 && !dismissed;

  const confirmDialog = showConflicts && (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
      <div className="mx-4 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
        <p className="text-base font-semibold text-zinc-900">This will break auto-fill mappings</p>
        <p className="mt-2 text-sm text-zinc-500">
          The new file no longer has these tokens, which are used by auto-fill config on:
        </p>
        <ul className="mt-3 space-y-1 text-sm text-zinc-700">
          {conflicts.map((c, i) => (
            <li key={i} className="rounded-md bg-red-50 px-3 py-1.5">
              <span className="font-mono text-xs">{`{${c.token}}`}</span>{" "}
              <span className="text-zinc-500">— {c.tableName}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-zinc-500">
          Those mappings will be left pointing at a token that no longer exists. You'll need to
          re-map them afterwards.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirmedInputRef.current) confirmedInputRef.current.value = "1";
              formRef.current?.requestSubmit();
            }}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {pending ? "Replacing…" : "Replace anyway"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mounted && confirmDialog && createPortal(confirmDialog, document.body)}
      <form ref={formRef} action={formAction} className="space-y-3">
        <input ref={confirmedInputRef} type="hidden" name="confirmed" defaultValue="" />
        <UploadDropzone
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          prompt="Drop a .docx file here or browse"
          hint="Word document (.docx) only"
          pending={pending}
          success={state.success}
          error={state.error}
          required
          onFile={(f) => setHasFile(f !== null)}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || !hasFile}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Uploading…" : "Replace file"}
          </button>
        </div>
      </form>
    </>
  );
}
