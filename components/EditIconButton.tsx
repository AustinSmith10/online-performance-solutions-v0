"use client";

// Shared edit trigger — a small pencil icon button, used in place of a text
// "Edit" button wherever clicking it reveals editable input field(s).
// `className` fully replaces (not appends to) the color/visibility styling,
// so it never fights the default on conflicting utilities (e.g. text color) —
// pass hover-reveal classes (e.g. "opacity-0 group-hover:opacity-100 ...")
// when embedding inside a dense row list that has a `group` ancestor; leave
// the default (always-visible, neutral) for standalone card/section headers.
export function EditIconButton({
  onClick,
  label,
  className = "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600",
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`shrink-0 rounded p-1 transition-opacity focus-visible:opacity-100 ${className}`}
    >
      <PencilIcon />
    </button>
  );
}

function PencilIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25a1.25 1.25 0 01-1.25 1.25h-9.5a1.25 1.25 0 01-1.25-1.25v-9.5z" />
    </svg>
  );
}
