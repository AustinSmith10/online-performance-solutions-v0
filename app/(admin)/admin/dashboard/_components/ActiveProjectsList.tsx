"use client";

// Replaces the old plain <table> "Active projects" list with the
// preset/filter system prototyped in app/prototype-admin-dashboard. Scope is
// deliberately just this dashboard's in-flight project set — full-lifecycle
// browsing (drafts, delivered, complete, paused, sorting) already lives at
// /admin/projects, so this stays a quick-filter view over "what's active
// right now," not a duplicate of that page.
//
// The dashboard's actionable "needs attention" work (assign consultant,
// reconcile override, resend stakeholder token, retry PBDR conversion)
// already lives in ActionPanel.tsx with real drawers wired to real server
// actions — this component doesn't touch or duplicate any of that. It's
// purely a browse/filter/paginate list; clicking a row navigates to the
// full project page like the old table did.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProjectStatus } from "@/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  dispatched: "Awaiting Approval",
  revision_required: "Revision Required",
  converting: "Converting to PBDR",
  delivered: "Delivered",
  complete: "Complete",
  paused: "Paused",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  submitted: "bg-blue-100 text-blue-700",
  assigned: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-purple-100 text-purple-700",
  dispatched: "bg-amber-100 text-amber-700",
  revision_required: "bg-red-100 text-red-700",
  converting: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
  paused: "bg-amber-100 text-amber-700",
};

// Only statuses that can actually appear in `projects` (server query is
// already scoped to in-flight) — no point offering checkboxes that can
// never match anything.
const IN_FLIGHT_STATUSES: ProjectStatus[] = [
  "submitted",
  "assigned",
  "in_progress",
  "dispatched",
  "revision_required",
  "converting",
];

const UNASSIGNED = "__unassigned__";

export type ActiveProjectItem = {
  id: string;
  href: string;
  label: string;
  client: string | null;
  consultant: string | null;
  status: ProjectStatus;
  dueLabel: string | null;
  overdue: boolean;
  awaitingStakeholder: boolean;
  overridePending: boolean;
};

type Filters = {
  statuses: ProjectStatus[];
  clients: string[];
  consultants: string[]; // names, or UNASSIGNED sentinel
  overdueOnly: boolean;
  awaitingOnly: boolean;
  overrideOnly: boolean;
  search: string;
};

const EMPTY_FILTERS: Filters = {
  statuses: [],
  clients: [],
  consultants: [],
  overdueOnly: false,
  awaitingOnly: false,
  overrideOnly: false,
  search: "",
};

type Preset = { id: string; label: string; filters: Filters; builtin: boolean };

const BUILTIN_PRESETS: Preset[] = [
  { id: "all-active", label: "All active", filters: EMPTY_FILTERS, builtin: true },
  { id: "unassigned", label: "Unassigned", filters: { ...EMPTY_FILTERS, consultants: [UNASSIGNED] }, builtin: true },
  { id: "overdue", label: "Overdue", filters: { ...EMPTY_FILTERS, overdueOnly: true }, builtin: true },
  { id: "awaiting-stakeholder", label: "Awaiting stakeholder", filters: { ...EMPTY_FILTERS, awaitingOnly: true }, builtin: true },
  { id: "overrides", label: "Overrides", filters: { ...EMPTY_FILTERS, overrideOnly: true }, builtin: true },
];

function isFilterActive(f: Filters): boolean {
  return (
    f.statuses.length > 0 ||
    f.clients.length > 0 ||
    f.consultants.length > 0 ||
    f.overdueOnly ||
    f.awaitingOnly ||
    f.overrideOnly ||
    f.search.trim() !== ""
  );
}

function matchesFilters(p: ActiveProjectItem, f: Filters): boolean {
  if (f.statuses.length > 0 && !f.statuses.includes(p.status)) return false;
  if (f.clients.length > 0 && (!p.client || !f.clients.includes(p.client))) return false;
  if (f.consultants.length > 0) {
    const matchesNamed = p.consultant !== null && f.consultants.includes(p.consultant);
    const matchesUnassigned = p.consultant === null && f.consultants.includes(UNASSIGNED);
    if (!matchesNamed && !matchesUnassigned) return false;
  }
  if (f.overdueOnly && !p.overdue) return false;
  if (f.awaitingOnly && !p.awaitingStakeholder) return false;
  if (f.overrideOnly && !p.overridePending) return false;
  if (f.search.trim()) {
    const needle = f.search.trim().toLowerCase();
    const haystack = `${p.label} ${p.client ?? ""} ${p.consultant ?? "unassigned"}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function accentClass(p: ActiveProjectItem): string {
  if (p.overdue) return "border-l-red-400";
  if (p.consultant === null) return "border-l-amber-400";
  if (p.awaitingStakeholder) return "border-l-blue-400";
  if (p.overridePending) return "border-l-purple-400";
  return "border-l-zinc-200";
}

function ProjectRow({ p }: { p: ActiveProjectItem }) {
  return (
    <Link
      href={p.href}
      className={`flex items-center gap-3 border-l-4 border-y border-r border-zinc-200 bg-white px-3 py-2.5 ${accentClass(p)} hover:bg-zinc-50`}
    >
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium text-zinc-900">{p.label}</span>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          {p.client ?? "—"} · {p.consultant ?? "Unassigned"}
          {p.dueLabel ? ` · Due ${p.dueLabel}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {p.overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Overdue</span>}
        {p.overridePending && (
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">Override</span>
        )}
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_CLASSES[p.status]}`}>
          {STATUS_LABELS[p.status]}
        </span>
      </div>
    </Link>
  );
}

function CheckboxRow({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-zinc-700 hover:bg-zinc-50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300" />
      {label}
    </label>
  );
}

function FilterPanel({
  filters,
  clients,
  consultants,
  onChange,
  onSaveView,
  onClose,
}: {
  filters: Filters;
  clients: string[];
  consultants: string[];
  onChange: (f: Filters) => void;
  onSaveView: (name: string) => void;
  onClose: () => void;
}) {
  const [viewName, setViewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  function toggle<K extends "statuses" | "clients" | "consultants">(key: K, value: string) {
    const list = filters[key] as string[];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    onChange({ ...filters, [key]: next } as Filters);
  }

  return (
    <div ref={ref} className="absolute left-0 top-9 z-50 w-[22rem] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
      <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Status</p>
          <div className="grid grid-cols-2 gap-x-2">
            {IN_FLIGHT_STATUSES.map((s) => (
              <CheckboxRow key={s} checked={filters.statuses.includes(s)} label={STATUS_LABELS[s]} onChange={() => toggle("statuses", s)} />
            ))}
          </div>
        </div>

        {clients.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Client</p>
            <div className="grid grid-cols-2 gap-x-2">
              {clients.map((c) => (
                <CheckboxRow key={c} checked={filters.clients.includes(c)} label={c} onChange={() => toggle("clients", c)} />
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Consultant</p>
          <div className="grid grid-cols-2 gap-x-2">
            <CheckboxRow checked={filters.consultants.includes(UNASSIGNED)} label="Unassigned" onChange={() => toggle("consultants", UNASSIGNED)} />
            {consultants.map((c) => (
              <CheckboxRow key={c} checked={filters.consultants.includes(c)} label={c} onChange={() => toggle("consultants", c)} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Flags</p>
          <div className="grid grid-cols-2 gap-x-2">
            <CheckboxRow checked={filters.overdueOnly} label="Overdue" onChange={(v) => onChange({ ...filters, overdueOnly: v })} />
            <CheckboxRow checked={filters.awaitingOnly} label="Awaiting stakeholder" onChange={(v) => onChange({ ...filters, awaitingOnly: v })} />
            <CheckboxRow checked={filters.overrideOnly} label="Payment override" onChange={(v) => onChange({ ...filters, overrideOnly: v })} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3">
        <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline">
          Clear all
        </button>
        <span className="text-xs text-zinc-400">{isFilterActive(filters) ? "Filters applied" : "No filters"}</span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-zinc-100 pt-3">
        <input
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          placeholder="Name this view…"
          className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
        />
        <button
          type="button"
          disabled={!viewName.trim() || !isFilterActive(filters)}
          onClick={() => {
            onSaveView(viewName.trim());
            setViewName("");
          }}
          className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save view
        </button>
      </div>
    </div>
  );
}

const PAGE_SIZE = 8;

export function ActiveProjectsList({ projects, storageKey }: { projects: ActiveProjectItem[]; storageKey: string }) {
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [presets, setPresets] = useState<Preset[]>(BUILTIN_PRESETS);
  const [activePresetId, setActivePresetId] = useState<string>("all-active");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const loadedFromStorage = useRef(false);

  // Custom views + their order are per-admin, saved locally — there's no
  // backend field for this yet, and it's not needed for a client-only
  // preference like pill order. Initial render always shows BUILTIN_PRESETS
  // (SSR has no window/localStorage); this effect hydrates the real saved
  // order right after mount. That one-time "sync from an external, non-React
  // store" read is exactly what effects are for, so the setState-in-effect
  // lint rule is suppressed here rather than contorted around.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { order: string[]; custom: Preset[] };
        const customById = new Map(saved.custom.map((p) => [p.id, p]));
        const merged = saved.order
          .map((id) => BUILTIN_PRESETS.find((p) => p.id === id) ?? customById.get(id))
          .filter((p): p is Preset => !!p);
        // Any built-in added since the admin last saved an order (or any
        // custom view missing from `order` for some reason) still shows up,
        // just appended at the end rather than silently disappearing.
        const missing = [...BUILTIN_PRESETS, ...saved.custom].filter((p) => !merged.some((m) => m.id === p.id));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage on mount, not a derived-state sync
        setPresets([...merged, ...missing]);
        setCustomPresets(saved.custom);
      }
    } catch {
      // Corrupt/old localStorage shape — fall back to defaults silently.
    }
    loadedFromStorage.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!loadedFromStorage.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ order: presets.map((p) => p.id), custom: customPresets }));
    } catch {
      // Storage full/unavailable — reordering still works for this session.
    }
  }, [presets, customPresets, storageKey]);

  // Reset pagination when filters change — adjusted during render (not an
  // effect) since this is purely derived from a prop/state change, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevFilters, setPrevFilters] = useState(filters);
  if (filters !== prevFilters) {
    setPrevFilters(filters);
    setVisibleCount(PAGE_SIZE);
  }

  const clients = Array.from(new Set(projects.map((p) => p.client).filter((c): c is string => !!c))).sort();
  const consultants = Array.from(new Set(projects.map((p) => p.consultant).filter((c): c is string => !!c))).sort();

  function selectPreset(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setActivePresetId(id);
    setFilters(preset.filters);
    setPanelOpen(false);
  }

  function updateFilters(next: Filters) {
    setFilters(next);
    setActivePresetId("");
  }

  function saveView(name: string) {
    const id = `custom-${Date.now()}`;
    const preset: Preset = { id, label: name, filters, builtin: false };
    setCustomPresets((prev) => [...prev, preset]);
    setPresets((prev) => [...prev, preset]);
    setActivePresetId(id);
    setPanelOpen(false);
  }

  function removePreset(id: string) {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    setCustomPresets((prev) => prev.filter((p) => p.id !== id));
    if (activePresetId === id) selectPreset("all-active");
  }

  function handlePresetDrop(targetIndex: number) {
    const fromIndex = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (fromIndex === null || fromIndex === targetIndex) return;
    setPresets((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  const filtered = projects.filter((p) => matchesFilters(p, filters));
  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset, i) => (
          <div
            key={preset.id}
            className={`group relative cursor-grab active:cursor-grabbing ${dragOverIndex === i ? "opacity-50" : ""}`}
            draggable
            onDragStart={() => {
              dragIndex.current = i;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverIndex !== i) setDragOverIndex(i);
            }}
            onDragLeave={() => setDragOverIndex((cur) => (cur === i ? null : cur))}
            onDrop={() => handlePresetDrop(i)}
            onDragEnd={() => {
              dragIndex.current = null;
              setDragOverIndex(null);
            }}
          >
            <button
              type="button"
              onClick={() => selectPreset(preset.id)}
              title="Drag to reorder"
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activePresetId === preset.id ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <span className={`mr-1.5 opacity-0 group-hover:opacity-100 ${activePresetId === preset.id ? "text-zinc-400" : "text-zinc-300"}`}>⠿</span>
              {preset.label}
              {!preset.builtin && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    removePreset(preset.id);
                  }}
                  className="ml-1.5 opacity-60 hover:opacity-100"
                >
                  ×
                </span>
              )}
            </button>
          </div>
        ))}

        <div className="relative">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium ${
              isFilterActive(filters) && activePresetId === "" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Filters {isFilterActive(filters) && activePresetId === "" ? "•" : ""}
          </button>
          {panelOpen && (
            <FilterPanel filters={filters} clients={clients} consultants={consultants} onChange={updateFilters} onSaveView={saveView} onClose={() => setPanelOpen(false)} />
          )}
        </div>

        <button
          type="button"
          title="New view"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            setActivePresetId("");
            setPanelOpen(true);
          }}
          className="rounded-full border border-dashed border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-700"
        >
          +
        </button>
      </div>

      <input
        value={filters.search}
        onChange={(e) => updateFilters({ ...filters, search: e.target.value })}
        placeholder="Search project, address, client…"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
      />

      {projects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">No active projects.</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-zinc-900">No projects match these filters</p>
          <button type="button" onClick={() => selectPreset("all-active")} className="mt-2 text-sm text-zinc-600 hover:text-zinc-900 hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg">
            {visible.map((p) => (
              <ProjectRow key={p.id} p={p} />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Showing {visible.length} of {filtered.length}
            </span>
            {visibleCount < filtered.length && (
              <button type="button" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50">
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
