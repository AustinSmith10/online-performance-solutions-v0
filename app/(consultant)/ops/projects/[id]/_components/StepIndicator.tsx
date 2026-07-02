export function StepIndicator({
  step,
  completed,
  locked,
}: {
  step: number;
  completed: boolean;
  locked?: boolean;
}) {
  if (completed) {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white text-xs font-semibold">
        ✓
      </div>
    );
  }
  if (locked) {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-400 text-xs font-semibold">
        {step}
      </div>
    );
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-xs font-semibold">
      {step}
    </div>
  );
}
