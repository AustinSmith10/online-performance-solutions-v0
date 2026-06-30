"use client";

import { useActionState, useRef, useState } from "react";
import { reuploadTemplate, type ReuploadTemplateState } from "@/app/actions/templates";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

export function ReuploadForm({ templateId }: { templateId: string }) {
  const action = reuploadTemplate.bind(null, templateId);
  const [state, formAction, pending] = useActionState<ReuploadTemplateState, FormData>(
    action,
    {}
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  useUnsavedChanges("reupload", fileName !== null);

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

  return (
    <form action={formAction} className="space-y-3">
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
          name="file"
          type="file"
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
              Drop a .docx file here or{" "}
              <span className="font-medium text-zinc-900 underline underline-offset-2">browse</span>
            </p>
            <p className="mt-1 text-xs text-zinc-400">Word document (.docx) only</p>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !fileName}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Replace file"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
