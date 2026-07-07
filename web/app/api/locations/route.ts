import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/locations?q=<query> — autocomplete city/region suggestions
 *
 * Proxies to the free, public Nominatim (OpenStreetMap) geocoding API.
 * No API key required; we add the required User-Agent header to comply
 * with their usage policy (https://operations.osmfoundation.org/policies/nominatim/).
 *
 * Returns a flat string[] of up to 5 location suggestions, e.g.
 * ["San Francisco, California, United States", "San Francisco, CA, USA"].
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const UA = "CareerOps/1.0 (job-search dashboard; contact@careerops.dev)";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const url = `${NOMINATIM_URL}?${new URLSearchParams({
      q,
      format: "json",
      addressdetails: "1",
      limit: "5",
      accept_language: "en",
      featureType: "city", // prefer city-level results
    })}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4_000),
    });

    if (!res.ok) {
      console.warn("[locations] Nominatim returned", res.status);
      return NextResponse.json([], { status: 200 });
    }

    const data = (await res.json()) as Array<{
      display_name?: string;
      address?: { city?: string; town?: string; village?: string; state?: string; country?: string };
    }>;

    const suggestions = data
      .map((entry) => {
        const a = entry.address;
        const city = a?.city || a?.town || a?.village;
        if (!city) return entry.display_name ?? null;
        const state = a?.state && isStateCode(a.state) ? a.state : "";
        const parts = [city, state, a?.country].filter(Boolean);
        return parts.join(", ");
      })
      .filter((s): s is string => typeof s === "string" && s.length > 1)
      .slice(0, 5);

    // Deduplicate (Nominatim may return near-duplicates)
    const unique = [...new Set(suggestions)];

    return NextResponse.json(unique);
  } catch (err) {
    console.warn("[locations] fetch failed:", (err as Error).message);
    return NextResponse.json([], { status: 200 });
  }
}

/**
 * Rough heuristic: is `s` a US/CA/AU state/province abbreviation?
 * Helps keep display_namestrim and avoiding redundancy like
 * "California, California, United States".
 */
function isStateCode(s: string): boolean {
  return /^[A-Z]{2}$/.test(s) && s.length === 2;
}