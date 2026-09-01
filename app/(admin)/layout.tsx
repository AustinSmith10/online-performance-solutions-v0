import { Suspense } from "react";
import { AccessNoticeBanner } from "@/components/AccessNoticeBanner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <Suspense>
        <AccessNoticeBanner />
      </Suspense>
      {children}
    </div>
  );
}
