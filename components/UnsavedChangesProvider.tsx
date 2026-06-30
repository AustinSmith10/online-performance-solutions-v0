"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface UnsavedChangesCtx {
  setDirty: (key: string, dirty: boolean) => void;
  requestNavigate: (onConfirm: () => void) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesCtx>({
  setDirty: () => {},
  requestNavigate: (fn) => fn(),
});

export function useUnsavedChanges(key: string, dirty: boolean) {
  const { setDirty } = useContext(UnsavedChangesContext);
  useEffect(() => {
    setDirty(key, dirty);
    return () => setDirty(key, false);
  }, [key, dirty, setDirty]);
}

export function useRequestNavigate() {
  return useContext(UnsavedChangesContext).requestNavigate;
}

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  // Link-click interception stores the href; tab-switch stores a callback
  const [blockedHref, setBlockedHref] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<{ fn: () => void } | null>(null);
  const [mounted, setMounted] = useState(false);
  const isDirtyRef = useRef(false);
  const router = useRouter();

  const isDirty = dirtyKeys.size > 0;

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const setDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Used by TemplateTabs (and any other in-page navigation) to check before switching
  const requestNavigate = useCallback((onConfirm: () => void) => {
    if (!isDirtyRef.current) {
      onConfirm();
      return;
    }
    setPendingNav({ fn: onConfirm });
  }, []);

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  // Native browser dialog for refresh / close tab / address bar
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Intercept internal anchor clicks for Next.js client-side navigation
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!isDirtyRef.current) return;
      const anchor = (e.target as Element).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("http://") ||
        href.startsWith("https://")
      ) return;
      e.preventDefault();
      e.stopPropagation();
      setBlockedHref(href);
    };
    window.addEventListener("click", handler, true);
    return () => window.removeEventListener("click", handler, true);
  }, []);

  const modalOpen = blockedHref !== null || pendingNav !== null;

  function handleLeave() {
    setDirtyKeys(new Set());
    if (pendingNav) {
      pendingNav.fn();
      setPendingNav(null);
    } else if (blockedHref) {
      router.push(blockedHref);
      setBlockedHref(null);
    }
  }

  function handleStay() {
    setPendingNav(null);
    setBlockedHref(null);
  }

  const modal = (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]"
        onClick={handleStay}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 className="text-sm font-semibold text-zinc-900">Unsaved changes</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          You have unsaved changes on this page. If you continue your changes will be lost.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleLeave}
            className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Leave without saving
          </button>
          <button
            type="button"
            onClick={handleStay}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Stay and save
          </button>
        </div>
      </div>
    </>
  );

  return (
    <UnsavedChangesContext.Provider value={{ setDirty, requestNavigate }}>
      {children}
      {mounted && modalOpen && createPortal(modal, document.body)}
    </UnsavedChangesContext.Provider>
  );
}
