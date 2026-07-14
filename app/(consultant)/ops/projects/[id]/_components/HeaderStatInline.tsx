export function HeaderStatInline({
  label,
  value,
  valueClassName,
  noLeftBorder,
}: {
  label?: string;
  value: React.ReactNode;
  valueClassName?: string;
  noLeftBorder?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${noLeftBorder ? "" : "border-l border-zinc-100 pl-7"}`}>
      {label && <span className="text-zinc-400">{label}</span>}
      <span className={`font-medium text-zinc-900 ${valueClassName ?? ""}`}>{value}</span>
    </span>
  );
}
