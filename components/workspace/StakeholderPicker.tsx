"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TagChips, type TagChipData } from "@/components/TagChip";

export interface PickerStakeholder {
  id: string;
  name: string;
  email: string;
  /** Internal-UI only (#213) — rendered through TagChip, never folded into `name`. */
  tags?: TagChipData[];
}

/**
 * Stakeholder dropdown for the submit-on-behalf pages. A custom listbox rather
 * than a native <select> because <option> can't hold the tag chips (#213).
 * Keyboard: ↑/↓ to move, Enter/Space to pick, Esc to close.
 */
export function StakeholderPicker({
  stakeholders,
  value,
  onChange,
  disabled,
  placeholder,
  className = "",
}: {
  stakeholders: PickerStakeholder[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = stakeholders.find((s) => s.id === value);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive(Math.max(0, stakeholders.findIndex((s) => s.id === value)));
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(stakeholders.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (stakeholders[active]) pick(stakeholders[active].id);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          setActive(Math.max(0, stakeholders.findIndex((s) => s.id === value)));
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center gap-2 text-left ${className}`}
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate">
              {selected.name} — {selected.email}
            </span>
            <TagChips tags={selected.tags} />
          </span>
        ) : (
          <span className="flex-1 truncate text-zinc-400">{placeholder}</span>
        )}
        <svg className="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-[0_8px_30px_rgb(0_0_0/0.10)]"
        >
          {stakeholders.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={s.id === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s.id)}
              className={`flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm text-zinc-900 ${
                i === active ? "bg-zinc-100" : ""
              } ${s.id === value ? "font-medium" : ""}`}
            >
              <span className="min-w-0 truncate">
                {s.name} — {s.email}
              </span>
              <TagChips tags={s.tags} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
