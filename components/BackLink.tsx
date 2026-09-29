import Link from "next/link";

// The leading arrow stays: unlike a trailing "→" on a pill (redundant next to
// the pill itself), "←" is the only cue that this goes back, not forward.
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="press inline-flex w-fit items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
    >
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  );
}
