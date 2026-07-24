import Image from "next/image";

export function Logo({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/logo.svg"
      alt="DDEG"
      width={529}
      height={314}
      priority
      className={className}
    />
  );
}
