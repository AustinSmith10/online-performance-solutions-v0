"use client";

import { useState } from "react";
import { adminDeleteProject } from "@/app/actions/projects";
import { useRouter } from "next/navigation";

export function AdminDeleteButton({ projectId }: { projectId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await adminDeleteProject(projectId);
    if (result.error) {
      setError(result.error);
      setPending(false);
      setConfirming(false);
    } else {
      router.push("/admin/recovery");
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
      >
        Delete project
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-900">
        Move this project to the recovery bin?
      </p>
      <p className="text-xs text-red-700">
        It will be permanently deleted after 30 days. You can restore it from the recovery bin before then.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={pending}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
