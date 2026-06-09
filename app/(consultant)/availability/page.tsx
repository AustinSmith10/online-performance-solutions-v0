import { requireRole } from "@/lib/auth/session";
import { setOwnAvailability } from "@/app/actions/consultant";
import type { ConsultantAvailability } from "@/types";

const OPTIONS: { value: ConsultantAvailability; label: string; description: string }[] = [
  {
    value: "available",
    label: "Available",
    description: "You can receive new project assignments.",
  },
  {
    value: "on_leave",
    label: "On leave",
    description: "You are temporarily unavailable. Super Admins will see this before assigning.",
  },
  {
    value: "at_capacity",
    label: "At capacity",
    description: "Your current workload is full. Super Admins will see this before assigning.",
  },
];

export default async function AvailabilityPage() {
  const user = await requireRole("consultant");
  const current = user.availability as ConsultantAvailability;

  return (
    <div className="mx-auto max-w-lg py-12 px-4">
      <h1 className="text-xl font-semibold text-zinc-900">Your availability</h1>
      <p className="mt-1 text-sm text-zinc-500">
        This status is visible to Super Admins when they assign projects. Update it whenever your
        capacity changes.
      </p>

      <div className="mt-8 space-y-3">
        {OPTIONS.map((opt) => {
          const isActive = current === opt.value;
          const action = setOwnAvailability.bind(null, opt.value);
          return (
            <form key={opt.value} action={action}>
              <button
                type="submit"
                disabled={isActive}
                className={`w-full rounded-lg border px-5 py-4 text-left transition-colors ${
                  isActive
                    ? "border-zinc-900 bg-zinc-900 text-white cursor-default"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
                }`}
              >
                <span className="block font-medium">{opt.label}</span>
                <span className={`mt-0.5 block text-sm ${isActive ? "text-zinc-300" : "text-zinc-500"}`}>
                  {opt.description}
                </span>
              </button>
            </form>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-zinc-400">
        Current status: <strong>{OPTIONS.find((o) => o.value === current)?.label}</strong>
      </p>
    </div>
  );
}
