export function HeaderStatInline({
  label,
  value,
  valueClassName,
  noLeftBorder,
  title,
}: {
  label?: string;
  value: React.ReactNode;
  valueClassName?: string;
  noLeftBorder?: boolean;
  /** Hover hint (#176) — shown as a native tooltip; the value also gets a
   *  help cursor so testers know an explanation is there. */
  title?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${title ? "cursor-help" : ""} ${
        noLeftBorder ? "" : "border-l border-zinc-100 pl-7"
      }`}
      title={title}
    >
      {label && <span className="text-zinc-400">{label}</span>}
      <span className={`font-medium text-zinc-900 ${valueClassName ?? ""}`}>{value}</span>
    </span>
  );
}
