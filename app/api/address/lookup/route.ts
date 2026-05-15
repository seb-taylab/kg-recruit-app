/**
 * @route GET /api/address/lookup?postal=540102
 * @returns { found: boolean, address?: AddressLookup, error?: string }
 *
 * Server-side proxy to OneMap's free Elastic search endpoint. We proxy
 * rather than calling OneMap directly from the browser so we can:
 *   - Cache responses on Vercel's data cache (postal codes don't change)
 *   - Keep network hygiene if OneMap tightens to require auth tokens
 *   - Avoid any potential CORS friction
 *   - Centralise error mapping so the client side stays dumb
 *
 * OneMap docs: https://www.onemap.gov.sg/apidocs/apidocs
 * Search endpoint is currently keyless. Attribution lives in the privacy
 * page ("Address lookup powered by OneMap (Singapore Land Authority)").
 *
 * Singapore-only by design. The caller (AddressFields component) validates
 * the postal format before invoking, but we re-validate here.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export interface AddressLookup {
  postal_code: string;
  block_number: string | null;
  street_name: string | null;
  building_name: string | null;
  full_address: string;
  latitude: number;
  longitude: number;
}

interface OneMapResult {
  BLK_NO?: string;
  ROAD_NAME?: string;
  BUILDING?: string;
  ADDRESS?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
}

interface OneMapResponse {
  found?: number;
  results?: OneMapResult[];
}

const ONEMAP_URL = "https://www.onemap.gov.sg/api/common/elastic/search";

// OneMap returns the literal string "NIL" when a field is unset. Map to null.
const cleanField = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed === "NIL") return null;
  return trimmed;
};

export async function GET(req: NextRequest) {
  const postal = req.nextUrl.searchParams.get("postal")?.trim() ?? "";

  if (!/^\d{6}$/.test(postal)) {
    return NextResponse.json(
      { found: false, error: "Postal code must be exactly 6 digits." },
      { status: 400 },
    );
  }

  const url = `${ONEMAP_URL}?searchVal=${postal}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;

  try {
    // 30-day data-cache TTL. Postal-code-to-address is effectively immutable
    // (the mapping changes only when LTA renames a road etc, and even then
    // a stale cached value is still useful — the applicant can edit).
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } });

    if (!res.ok) {
      return NextResponse.json(
        {
          found: false,
          error: "Address service is unavailable right now. Enter the address manually below.",
        },
        { status: 502 },
      );
    }

    const data = (await res.json()) as OneMapResponse;
    const top = data.results?.[0];
    if (!top || data.found === 0) {
      return NextResponse.json(
        {
          found: false,
          error: "We couldn't find that postal code. Check it, or enter the address manually.",
        },
        { status: 404 },
      );
    }

    // Coerce lat/lng safely. OneMap returns them as strings.
    const latitude = Number(top.LATITUDE);
    const longitude = Number(top.LONGITUDE);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        {
          found: false,
          error: "Address lookup returned bad coordinates. Enter the address manually.",
        },
        { status: 502 },
      );
    }

    const address: AddressLookup = {
      postal_code: postal,
      block_number: cleanField(top.BLK_NO),
      street_name: cleanField(top.ROAD_NAME),
      building_name: cleanField(top.BUILDING),
      full_address: cleanField(top.ADDRESS) ?? "",
      latitude,
      longitude,
    };
    return NextResponse.json({ found: true, address });
  } catch {
    // Network error or JSON parse failure — both surface the same user
    // message: fall back to manual.
    return NextResponse.json(
      {
        found: false,
        error: "Network error while looking up the address. Try again, or enter it manually.",
      },
      { status: 500 },
    );
  }
}
