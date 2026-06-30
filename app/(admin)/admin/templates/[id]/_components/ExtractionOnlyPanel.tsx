"use client";

import { useState, useTransition, useEffect, useRef, useActionState } from "react";
import { createPortal } from "react-dom";
import {
  addExtractionOnlyToken,
  deleteExtractionToken,
  updateExtractionToken,
  type AddExtractionTokenState,
} from "@/app/actions/templates";

interface Row {
  id: string;
  placeholder_token: string;
  display_label: string | null;
  extraction_hint: string | null;
  is_required: boolean;
}

interface Props {
  templateId: string;
  tokens: Row[];
  highlightToken?: string;
}

export function ExtractionOnlyPanel({ templateId, tokens, highlightToken }: Props) {
  const [open, setOpen] = useState(!!highlightToken);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  const overlay = (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        className="fixed inset-0 z-40 bg-black/20 transition-opacity duration-300"
      />

      {/* Slide-in panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "24rem",
          height: "100dvh",
          zIndex: 50,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms ease-in-out",
        }}
        className="flex flex-col border-l border-zinc-200 bg-white"
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-start justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              Extraction-only tokens ({tokens.length})
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Extracted from documents but not placed in the .docx — used for Halcyon lookups and system operations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close panel"
            className="ml-3 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tokens.length === 0 && (
            <p className="py-6 text-center text-xs text-zinc-400">No extraction-only tokens yet.</p>
          )}
          {tokens.map((token) => (
            <ExtractionTokenCard
              key={token.id}
              templateId={templateId}
              token={token}
              highlight={token.placeholder_token === highlightToken}
            />
          ))}

          {/* Add form */}
          <div className="border-t border-zinc-100 pt-4">
            <AddTokenForm templateId={templateId} />
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Extraction-only ({tokens.length}) →
      </button>
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}

function ExtractionTokenCard({
  templateId,
  token,
  highlight,
}: {
  templateId: string;
  token: Row;
  highlight?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isSavePending, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | undefined>();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlight || !cardRef.current) return;
    const el = cardRef.current;
    el.style.outline = "2px solid #4ade80";
    el.style.outlineOffset = "-2px";
    const t = setTimeout(() => {
      el.style.transition = "outline-color 0.6s ease";
      el.style.outlineColor = "transparent";
    }, 2000);
    return () => clearTimeout(t);
  }, [highlight]);

  function handleSave(fd: FormData) {
    startSaveTransition(async () => {
      const result = await updateExtractionToken(templateId, token.id, {}, fd);
      if (result.error) {
        setSaveError(result.error);
      } else {
        setSaveError(undefined);
        setEditing(false);
      }
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      await deleteExtractionToken(templateId, token.placeholder_token);
    });
  }

  if (editing) {
    return (
      <div ref={cardRef} className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4">
        <p className="mb-3 font-mono text-xs text-zinc-500">{"{" + token.placeholder_token + "}"}</p>
        <form action={handleSave} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Display label <span className="text-red-400">*</span>
            </label>
            <input
              name="label"
              type="text"
              required
              defaultValue={token.display_label ?? ""}
              className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Extraction hint <span className="text-red-400">*</span>
            </label>
            <textarea
              name="hint"
              required
              rows={4}
              defaultValue={token.extraction_hint ?? ""}
              className="w-full resize-y rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
            <input
              type="checkbox"
              name="is_required"
              defaultChecked={token.is_required}
              className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
            />
            Required
          </label>
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSavePending}
              className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {isSavePending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`rounded-lg border border-zinc-200 bg-white p-4 ${isDeletePending ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-xs text-zinc-400">{"{" + token.placeholder_token + "}"}</p>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-zinc-500 hover:text-zinc-800"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeletePending}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-sm font-medium text-zinc-900">
        {token.display_label ?? <span className="text-zinc-400">No label set</span>}
      </p>
      {token.extraction_hint && (
        <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{token.extraction_hint}</p>
      )}
      {token.is_required && (
        <span className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          Required
        </span>
      )}
    </div>
  );
}

function AddTokenForm({ templateId }: { templateId: string }) {
  const boundAdd = addExtractionOnlyToken.bind(null, templateId);
  const [state, formAction, pending] = useActionState<AddExtractionTokenState, FormData>(
    boundAdd,
    {}
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs font-medium text-zinc-700">Add extraction-only token</p>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          Token name <span className="text-red-400">*</span>
        </label>
        <input
          name="token"
          type="text"
          required
          placeholder="EXTRACT_DEV_NAME"
          className="w-full rounded border border-zinc-200 px-2 py-1.5 font-mono text-xs uppercase text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
        <p className="mt-0.5 text-xs text-zinc-400">Must start with EXTRACT_</p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          Display label <span className="text-red-400">*</span>
        </label>
        <input
          name="label"
          type="text"
          required
          placeholder="e.g. Development name"
          className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          Extraction hint <span className="text-red-400">*</span>
        </label>
        <textarea
          name="hint"
          required
          rows={3}
          placeholder="Tell Claude what to look for and where in the submitted documents…"
          className="w-full resize-y rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
        <input
          type="checkbox"
          name="is_required"
          id="add-extraction-required"
          className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
        />
        Required — block submission if client cannot confirm this value
      </label>

      {state.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add token"}
      </button>
    </form>
  );
}
