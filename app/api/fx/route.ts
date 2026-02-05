import { NextResponse } from "next/server";
import { forwardRate } from "@/lib/fx";
import { fetchSpotFromSheet } from "@/lib/sheets";
import { FxBoard } from "@/lib/types";

// ── Primary: Google Finance rate from the Google Sheet cell J1 ──
async function fetchFromGoogleSheet(): Promise<{ rate: number; source: string } | null> {
  try {
    const rate = await fetchSpotFromSheet();
    if (rate) return { rate, source: "Google Finance (Sheet)" };
  } catch { /* fall through */ }
  return null;
}

// ── Fallback: Free public APIs ──
async function fetchFromFreeAPIs(): Promise<{ rate: number; source: string } | null> {
  const apis = [
    {
      name: "frankfurter",
      url: "https://api.frankfurter.app/latest?from=USD&to=INR",
      parse: (d: Record<string, unknown>) => {
        const rates = d.rates as Record<string, number> | undefined;
        return rates?.INR;
      },
    },
    {
      name: "open.er-api",
      url: "https://open.er-api.com/v6/latest/USD",
      parse: (d: Record<string, unknown>) => {
        const rates = d.rates as Record<string, number> | undefined;
        return rates?.INR;
      },
    },
    {
      name: "fawazahmed0",
      url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      parse: (d: Record<string, unknown>) => {
        const usd = d.usd as Record<string, number> | undefined;
        return usd?.inr;
      },
    },
  ];

  for (const api of apis) {
    try {
      const res = await fetch(api.url, {
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const rate = api.parse(data);
      if (rate && rate > 50 && rate < 200) {
        return { rate, source: api.name };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// Fetch multiple currency pairs (for dashboard display)
async function fetchMultiPairRates(): Promise<Record<string, number>> {
  const pairs: Record<string, number> = {};
  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP",
      { signal: AbortSignal.timeout(5000), next: { revalidate: 0 } }
    );
    if (res.ok) {
      const data = await res.json();
      const rates = data.rates as Record<string, number>;
      if (rates?.INR) pairs["USDINR"] = rates.INR;
      if (rates?.EUR && rates?.INR) {
        pairs["EURINR"] = rates.INR / rates.EUR;
      }
      if (rates?.GBP && rates?.INR) {
        pairs["GBPINR"] = rates.INR / rates.GBP;
      }
    }
  } catch { /* fallback */ }
  return pairs;
}

// Cache with 60-second TTL
let cachedFx: FxBoard | null = null;
let cachedPairs: Record<string, number> = {};
let cacheSource = "";
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000;

function computeForwards(spot: number): Partial<FxBoard> {
  return {
    fwd1m: forwardRate(spot, 1),
    fwd2m: forwardRate(spot, 2),
    fwd3m: forwardRate(spot, 3),
    fwd6m: forwardRate(spot, 6),
    fwd12m: forwardRate(spot, 12),
  };
}

async function getLatestFx(): Promise<{ fx: FxBoard; pairs: Record<string, number>; source: string }> {
  const now = Date.now();

  if (cachedFx && now - lastFetchTime < CACHE_TTL_MS) {
    return { fx: cachedFx, pairs: cachedPairs, source: cacheSource };
  }

  // Priority chain: 1) Google Sheet J1 (Google Finance), 2) Free APIs, 3) Fallback
  let spot = 90.2912;
  let source = "fallback";

  const sheetResult = await fetchFromGoogleSheet();
  if (sheetResult) {
    spot = sheetResult.rate;
    source = sheetResult.source;
  } else {
    const apiResult = await fetchFromFreeAPIs();
    if (apiResult) {
      spot = apiResult.rate;
      source = apiResult.source;
    }
  }

  // Fetch multi-pair rates in parallel (best effort)
  const pairResult = await fetchMultiPairRates();

  const forwards = computeForwards(spot);
  const fx: FxBoard = {
    spot,
    fwd1m: forwards.fwd1m!,
    fwd2m: forwards.fwd2m!,
    fwd3m: forwards.fwd3m!,
    fwd6m: forwards.fwd6m!,
    fwd12m: forwards.fwd12m!,
    updatedAt: new Date().toISOString(),
  };

  cachedFx = fx;
  cachedPairs = pairResult;
  cacheSource = source;
  lastFetchTime = now;

  return { fx, pairs: pairResult, source };
}

// Force dynamic — never cache at CDN/build time
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { fx, pairs, source } = await getLatestFx();
  return NextResponse.json({ fx, pairs, source });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.spot) {
      const spot = Number(body.spot);
      const forwards = computeForwards(spot);
      const fx: FxBoard = {
        spot,
        fwd1m: body.fwd1m ? Number(body.fwd1m) : forwards.fwd1m!,
        fwd2m: body.fwd2m ? Number(body.fwd2m) : forwards.fwd2m!,
        fwd3m: body.fwd3m ? Number(body.fwd3m) : forwards.fwd3m!,
        fwd6m: body.fwd6m ? Number(body.fwd6m) : forwards.fwd6m!,
        fwd12m: body.fwd12m ? Number(body.fwd12m) : forwards.fwd12m!,
        updatedAt: new Date().toISOString(),
      };
      cachedFx = fx;
      lastFetchTime = Date.now();
      cacheSource = "manual";
      return NextResponse.json({ fx, pairs: cachedPairs, source: "manual" });
    }
    const { fx, pairs, source } = await getLatestFx();
    return NextResponse.json({ fx, pairs, source });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
