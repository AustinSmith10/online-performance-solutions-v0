"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

/**
 * Renders modal UI at <body>, outside whatever stacking context the trigger
 * lives in. Without this, a modal opened from inside a `relative z-10` row is
 * trapped below sticky bars (the dashboard tab bar painted across the Review
 * drawer). Renders nothing on the server and during hydration.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
