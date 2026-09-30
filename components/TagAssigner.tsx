"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { assignTag, unassignTag } from "@/app/actions/tags";
import { TagChip, TagChips, type TagChipData } from "@/components/TagChip";
import { ModalPortal } from "@/components/ModalPortal";

/**
 * Tags on one account: the current chips plus a "Tags" button that opens a
 * checklist popover (#213). Ticking a row assigns, unticking removes, saved
 * immediately with the change shown optimistically and rolled back on error.
 *
 * Only rendered where the server already decided the viewer may tag this
 * account (lib/tags/permissions.ts); the actions re-check that regardless.
 * Keyboard: Enter/Space/↓ opens, ↑/↓ moves, Space/Enter toggles, Esc closes and
 * returns focus. The popover grows from its trigger (origin-aware) and is
 * portalled so no card's overflow can clip it.
 */
export function TagAssigner({
  targetUserId,
  assigned,
  allTags,
  manageHref,
}: {
  targetUserId: string;
  assigned: TagChipData[];
  allTags: TagChipData[];
  /** Shown as a "Manage tags" link inside the popover for the super admin. */
  manageHref?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(assigned.map((t) => t.id)));
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; up: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Re-sync when the server data changes (router.refresh, navigation): reset
  // during render on a changed key, not in an effect (no extra paint).
  const assignedKey = assigned.map((t) => t.id).join(",");
  const [seenKey, setSeenKey] = useState(assignedKey);
  if (seenKey !== assignedKey) {
    setSeenKey(assignedKey);
    setSelected(new Set(assignedKey ? assignedKey.split(",") : []));
  }

  const chips = allTags.filter((t) => selected.has(t.id));

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const panelH = 60 + Math.min(allTags.length, 6) * 40 + (manageHref ? 40 : 0);
    const up = window.innerHeight - r.bottom < panelH + 16 && r.top > panelH;
    setPos({
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      left: Math.max(8, Math.min(r.left, window.innerWidth - 268)),
      up,
    });
  }, [open, allTags.length, manageHref]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, pos]);

  function toggle(tag: TagChipData) {
    const on = !selected.has(tag.id);
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(tag.id);
      else next.delete(tag.id);
      return next;
    });
    startTransition(async () => {
      const result = await (on ? assignTag(tag.id, targetUserId) : unassignTag(tag.id, targetUserId));
      if (result.error) {
        setError(result.error);
        setSelected((prev) => {
          const next = new Set(prev);
          if (on) next.delete(tag.id);
          else next.add(tag.id);
          return next;
        });
      } else {
        router.refresh();
      }
    });
  }

  function closeAndReturn() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndReturn();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(allTags.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if ((e.key === "Enter" || e.key === " ") && allTags[active]) {
      e.preventDefault();
      toggle(allTags[active]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TagChips tags={chips} />
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setActive(0);
          setOpen((o) => !o);
        }}
        className="press inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 transition-colors duration-150 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-3"
      >
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
          <path d="M8 3.5v9M3.5 8h9" />
        </svg>
        {chips.length === 0 ? "Add tag" : "Edit tags"}
      </button>
      {error && (
        <span role="alert" className="w-full text-xs text-red-600">
          {error}
        </span>
      )}

      {open && (
        <ModalPortal>
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Tags"
            tabIndex={-1}
            onKeyDown={onPanelKeyDown}
            style={pos ? { top: pos.top, bottom: pos.bottom, left: pos.left } : { visibility: "hidden" }}
            className={`tray-pop fixed z-[100] w-64 overflow-hidden rounded-lg border border-zinc-200 bg-white text-sm shadow-[0_8px_30px_rgb(0_0_0/0.10)] outline-none ${
              pos?.up ? "origin-bottom-left" : "origin-top-left"
            }`}
          >
            {allTags.length === 0 ? (
              <p className="px-3 py-3 text-xs leading-relaxed text-zinc-500">
                No tags exist yet.{" "}
                {manageHref ? (
                  <Link href={manageHref} className="font-medium text-zinc-900 hover:underline">
                    Create one
                  </Link>
                ) : (
                  "Ask a super admin to create some."
                )}
              </p>
            ) : (
              <ul className="max-h-60 overflow-y-auto py-1">
                {allTags.map((t, i) => {
                  const on = selected.has(t.id);
                  return (
                    <li
                      key={t.id}
                      role="option"
                      aria-selected={on}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => toggle(t)}
                      className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 [@media(pointer:coarse)]:min-h-11 ${
                        i === active ? "bg-zinc-100" : ""
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                          on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white"
                        }`}
                      >
                        {on && (
                          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3.5 8.5l3 3 6-7" />
                          </svg>
                        )}
                      </span>
                      <TagChip tag={t} className="max-w-none" />
                    </li>
                  );
                })}
              </ul>
            )}
            {manageHref && allTags.length > 0 && (
              <div className="border-t border-zinc-100 px-3 py-2">
                <Link href={manageHref} className="text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:underline">
                  Manage tags
                </Link>
              </div>
            )}
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
