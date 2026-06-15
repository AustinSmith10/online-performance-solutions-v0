import { createAdminClient } from "@/lib/supabase/admin";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface NagerHoliday {
  date: string;
  global: boolean;
  counties: string[] | null;
}

// Returns ISO date strings ("YYYY-MM-DD") that are public holidays for the
// given state and year. state is a bare AU code e.g. "NSW", "VIC", or null
// meaning unknown — in which case all national + state holidays are included.
export async function getPublicHolidays(state: string | null, year: number): Promise<Set<string>> {
  const supabase = createAdminClient();
  const cacheKey = state ?? "NATIONAL";

  const { data: cached } = await supabase
    .from("public_holiday_cache")
    .select("holidays, fetched_at")
    .eq("state_territory", cacheKey)
    .eq("year", year)
    .maybeSingle();

  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetched_at as string).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return new Set(cached.holidays as string[]);
    }
  }

  let holidays: Set<string>;
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/AU`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as NagerHoliday[];

    const stateCode = state ? `AU-${state}` : null;
    holidays = new Set(
      data
        .filter((h) => {
          if (h.global || !h.counties || h.counties.length === 0) return true;
          if (!stateCode) return true; // unknown state — include everything
          return h.counties.includes(stateCode);
        })
        .map((h) => h.date)
    );
  } catch (err) {
    console.error("[getPublicHolidays] API fetch failed:", err);
    // Fall back to stale cache if available, otherwise empty (weekends-only calculation)
    return cached ? new Set(cached.holidays as string[]) : new Set();
  }

  await supabase.from("public_holiday_cache").upsert(
    {
      state_territory: cacheKey,
      year,
      holidays: Array.from(holidays),
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "state_territory,year" }
  );

  return holidays;
}
