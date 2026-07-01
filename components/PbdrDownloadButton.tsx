"use client";

import { useState } from "react";
import { DownloadToast } from "@/components/DownloadToast";

export function PbdrDownloadButton({
  href,
  filename,
  label = "Download",
  className = "shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50",
}: {
  href: string;
  filename?: string;
  label?: string;
  className?: string;
}) {
  const [toastVisible, setToastVisible] = useState(false);

  function handleClick() {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 4000);
  }

  return (
    <>
      <a href={href} download={filename} onClick={handleClick} className={className}>
        {label}
      </a>
      <DownloadToast visible={toastVisible} />
    </>
  );
}
