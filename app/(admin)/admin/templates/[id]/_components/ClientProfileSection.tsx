"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import { updateClientProfile } from "@/app/actions/templates";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

export interface ClientProfileRow {
  id: string;
  placeholder_token: string;
  display_label: string | null;
  client_visible: boolean;
  client_sort_order: number;
  in_template: boolean;
}

interface Props {
  templateId: string;
  tokens: ClientProfileRow[];
}

export function ClientProfileSection({ templateId, tokens }: Props) {
  const boundAction = updateClientProfile.bind(null, templateId);
  const [state, formAction, pending] = useActionState(boundAction, {});

  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChanges("client-profile", isDirty);
  useEffect(() => { if (state.success) queueMicrotask(() => setIsDirty(false)); }, [state.success]);

  const [items, setItems] = useState<ClientProfileRow[]>(() =>
    [...tokens].sort(
      (a, b) => a.client_sort_order - b.client_sort_order || a.placeholder_token.localeCompare(b.placeholder_token)
    )
  );

  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function toggleVisible(index: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, client_visible: !item.client_visible } : item
      )
    );
    setIsDirty(true);
  }

  function onDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;
    setDragOverIndex(index);
  }

  function onDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, moved);
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setItems(next);
    setIsDirty(true);
  }

  function onDragEnd() {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }

  if (tokens.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400">
        No extraction tokens found — add EXTRACT_ tokens in the Tokens tab first.
      </p>
    );
  }

  return (
    <form action={formAction}>
      {/* Hidden inputs carry current state on submit */}
      {items.map((item, index) => (
        <span key={`inputs-${item.id}`}>
          <input type="hidden" name={`order_${item.placeholder_token}`} value={(index + 1) * 10} />
          <input type="hidden" name={`visible_${item.placeholder_token}`} value={item.client_visible ? "on" : "off"} />
        </span>
      ))}

      <div className="space-y-2 p-4">
        {items.map((item, index) => {
          const isDragOver = dragOverIndex === index;
          return (
            <div
              key={item.id}
              draggable
              onDragStart={() => onDragStart(index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={(e) => onDrop(e, index)}
              onDragEnd={onDragEnd}
              style={{ display: "grid", gridTemplateColumns: "28px 1fr auto" }}
              className={`rounded-lg border overflow-hidden transition-all ${
                isDragOver ? "border-blue-300" : "border-zinc-200 bg-white"
              } ${!item.client_visible ? "opacity-50" : ""}`}
            >
              {/* Drag handle */}
              <div className="flex items-center justify-center border-r border-zinc-100 bg-zinc-50 cursor-grab select-none text-zinc-300 hover:text-zinc-500 text-base">
                ⠿
              </div>

              {/* Token info */}
              <div className="min-w-0 px-4 py-3">
                <p className={`text-sm font-medium ${item.display_label ? "text-zinc-900" : "italic text-zinc-400"}`}>
                  {item.display_label ?? "No label set"}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs text-zinc-400">{item.placeholder_token}</p>
                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                    item.in_template ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"
                  }`}>
                    {item.in_template ? "In template" : "Extraction only"}
                  </span>
                </div>
              </div>

              {/* Visibility toggle */}
              <div className="flex items-center border-l border-zinc-100 px-4">
                <button
                  type="button"
                  onClick={() => toggleVisible(index)}
                  className={`text-xs font-medium transition-colors ${
                    item.client_visible
                      ? "text-green-700 hover:text-green-900"
                      : "text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  {item.client_visible ? "● Visible" : "○ Hidden"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-zinc-100 px-5 py-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile layout"}
        </button>
        {state.success && <p className="text-sm text-green-600">Saved.</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
