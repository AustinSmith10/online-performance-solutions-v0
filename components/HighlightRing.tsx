"use client";

import { useEffect, useRef } from "react";

export function HighlightRing({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("ring-2", "ring-green-400", "ring-offset-1", "rounded-lg");
    const t = setTimeout(() => {
      el.style.transition = "box-shadow 0.6s ease";
      el.classList.remove("ring-2", "ring-green-400", "ring-offset-1");
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  return <div ref={ref}>{children}</div>;
}
