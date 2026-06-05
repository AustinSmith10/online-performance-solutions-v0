export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
