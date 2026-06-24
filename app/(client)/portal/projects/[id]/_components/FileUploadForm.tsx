"use client";

import { useActionState, useRef, useState } from "react";
import { uploadProjectFile, type UploadFileState } from "@/app/actions/projects";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadForm({ projectId }: { projectId: string }) {
  const boundAction = uploadProjectFile.bind(null, projectId);
  const [state, formAction, pending] = useActionState<UploadFileState, FormData>(
    boundAction,
    {}
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  function applyFile(file: File | undefined) {
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setSizeError(`"${file.name}" exceeds the 50 MB limit (${formatFileSize(file.size)}).`);
      setFileInfo(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setSizeError(null);
    setFileInfo({ name: file.name, size: file.size });
  }

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
      applyFile(file);
    }
  }

  return (
    <form action={formAction} className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !pending && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-6 text-center transition-colors ${
          pending
            ? "cursor-default border-zinc-100 bg-zinc-50"
            : dragOver
            ? "border-zinc-400 bg-zinc-50"
            : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept="application/pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg"
          required
          disabled={pending}
          className="hidden"
          onChange={(e) => applyFile(e.target.files?.[0])}
        />
        {pending ? (
          <div className="flex flex-col items-center gap-2">
            <Spinner className="h-5 w-5 text-zinc-400" />
            <p className="text-sm text-zinc-500">Uploading…</p>
          </div>
        ) : fileInfo ? (
          <div>
            <p className="text-sm font-medium text-zinc-800">{fileInfo.name}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{formatFileSize(fileInfo.size)} — click to change</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              Drop a file here or{" "}
              <span className="font-medium text-zinc-900 underline underline-offset-2">browse</span>
            </p>
            <p className="mt-1 text-xs text-zinc-400">PDF, Word, Excel, or image — 50 MB max</p>
          </>
        )}
      </div>

      {sizeError && <p className="text-xs text-red-600">{sizeError}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !fileInfo || !!sizeError}
          className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending && <Spinner className="h-4 w-4" />}
          {pending ? "Uploading…" : "Upload document"}
        </button>
        {state.success && <p className="text-sm text-green-600">Uploaded successfully.</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
