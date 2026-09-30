// Shared Save button for the settings cards. Disabled until the form is
// edited (see hooks/useFormDirty) and while a save is in flight.
export function SettingsSaveButton({ pending, dirty }: { pending: boolean; dirty: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="press rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}
