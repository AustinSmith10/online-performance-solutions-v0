const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

export type ProfileFieldErrors = {
  phone?: string[];
  company_role?: string[];
  state_territory?: string[];
};

/** Phone / job title / state fields shared by the onboarding and fallback profile-completion forms. */
export function ProfileFieldsFragment({ errors }: { errors?: ProfileFieldErrors }) {
  return (
    <>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-zinc-700">
          Phone number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
        {errors?.phone?.map((e) => (
          <p key={e} className="mt-1 text-xs text-red-600">
            {e}
          </p>
        ))}
      </div>

      <div>
        <label htmlFor="company_role" className="block text-sm font-medium text-zinc-700">
          Your role
        </label>
        <input
          id="company_role"
          name="company_role"
          type="text"
          placeholder="e.g. Property Manager"
          required
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
        {errors?.company_role?.map((e) => (
          <p key={e} className="mt-1 text-xs text-red-600">
            {e}
          </p>
        ))}
      </div>

      <div>
        <label htmlFor="state_territory" className="block text-sm font-medium text-zinc-700">
          State / Territory
        </label>
        <select
          id="state_territory"
          name="state_territory"
          required
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        >
          <option value="">Select…</option>
          {AU_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {errors?.state_territory?.map((e) => (
          <p key={e} className="mt-1 text-xs text-red-600">
            {e}
          </p>
        ))}
      </div>
    </>
  );
}
