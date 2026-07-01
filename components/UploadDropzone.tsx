"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  accept: string;
  inputName?: string;
  prompt?: string;
  hint: string;
  pending: boolean;
  success?: boolean;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  onFile?: (file: File | null) => void;
}

export function UploadDropzone({
  accept,
  inputName = "file",
  prompt = "Drop a file here or browse",
  hint,
  pending,
  success,
  error,
  required,
  disabled,
  onFile,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimerRef = useRef<{ iv: ReturnType<typeof setInterval>; to: ReturnType<typeof setTimeout> } | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [showResult, setShowResult] = useState(false);

  // File-selection load-in animation state
  const [loadingIn, setLoadingIn] = useState(false);
  const [loadPct, setLoadPct] = useState(0);

  function startLoadAnimation() {
    if (loadTimerRef.current) {
      clearInterval(loadTimerRef.current.iv);
      clearTimeout(loadTimerRef.current.to);
    }
    const duration = 2000;
    const start = Date.now();
    setLoadingIn(true);
    setLoadPct(0);
    const iv = setInterval(() => {
      setLoadPct(Math.min(100, ((Date.now() - start) / duration) * 100));
    }, 30);
    const to = setTimeout(() => {
      clearInterval(iv);
      setLoadPct(100);
      setLoadingIn(false);
      loadTimerRef.current = null;
    }, duration);
    loadTimerRef.current = { iv, to };
  }

  // Show result (success/error) 400ms after pending ends
  useEffect(() => {
    if (!pending) return;
    return () => {
      resultTimerRef.current = setTimeout(() => {
        setShowResult(true);
      }, 400);
    };
  }, [pending]);

  useEffect(() => () => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    if (loadTimerRef.current) {
      clearInterval(loadTimerRef.current.iv);
      clearTimeout(loadTimerRef.current.to);
    }
  }, []);

  function applyFile(f: File | undefined | null) {
    if (!f) return;
    setFile(f);
    setShowResult(false);
    onFile?.(f);
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
    startLoadAnimation();
  }

  function handleClick() {
    if (pending || disabled) return;
    if (showResult) {
      setShowResult(false);
      setFile(null);
      onFile?.(null);
    }
    inputRef.current?.click();
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!pending && !disabled) setDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!pending && !disabled) applyFile(e.dataTransfer.files[0]);
  }

  const isBlocked = pending || !!disabled;

  let inner: React.ReactNode;

  if (pending) {
    inner = (
      <div className="flex flex-col items-center gap-2">
        <svg className="h-5 w-5 animate-spin text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.291l3-3.291z" />
        </svg>
        <p className="text-sm text-zinc-500">Uploading…</p>
      </div>
    );
  } else if (showResult && success) {
    inner = (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
          <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-800">{file?.name}</p>
        <p className="text-xs text-zinc-400">Click to upload another</p>
      </div>
    );
  } else if (showResult && error) {
    inner = (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
          <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-sm text-red-600">{error}</p>
        <p className="text-xs text-zinc-400">Click to try again</p>
      </div>
    );
  } else if (loadingIn) {
    inner = (
      <div className="w-full space-y-2 text-center">
        <p className="text-sm font-medium text-zinc-800">{file?.name}</p>
        <div className="mx-auto h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-green-500 transition-none"
            style={{ width: `${loadPct}%` }}
          />
        </div>
      </div>
    );
  } else if (file) {
    inner = <p className="text-sm font-medium text-zinc-800">{file.name}</p>;
  } else {
    const browseIdx = prompt.indexOf("browse");
    inner = (
      <>
        <p className="text-sm text-zinc-600">
          {browseIdx >= 0 ? (
            <>
              {prompt.slice(0, browseIdx)}
              <span className="font-medium text-zinc-900 underline underline-offset-2">browse</span>
              {prompt.slice(browseIdx + 6)}
            </>
          ) : (
            prompt
          )}
        </p>
        <p className="mt-1 text-xs text-zinc-400">{hint}</p>
      </>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed px-6 py-6 text-center transition-colors ${
        isBlocked && !showResult
          ? "cursor-default border-zinc-100 bg-zinc-50"
          : dragOver
          ? "border-zinc-400 bg-zinc-50"
          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        name={inputName}
        accept={accept}
        required={required}
        disabled={isBlocked}
        className="hidden"
        onChange={(e) => applyFile(e.target.files?.[0])}
      />
      {inner}
    </div>
  );
}
