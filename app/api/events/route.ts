import { NextResponse } from "next/server";
import { fetchFxRates } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * USDINR Event Watch - Live Economic Calendar
 *
 * Primary source: Finnhub API (free tier: 60 calls/min)
 * Fallback: Generated typical event dates
 *
 * Get your free API key at: https://finnhub.io
 * Add to .env.local: FINNHUB_API_KEY=your_key_here
 */

type EventImpact = 1 | 2 | 3 | 4 | 5;
type BiasDirection = "usdinr_up" | "usdinr_down" | "volatile" | "depends";

export type MarketEvent = {
  id: string;
  dateISO: string;
  dateDisplay: string;
  daysFromNow: number;
  time?: string;
  event: string;
  category: "fed" | "us_data" | "rbi" | "india_data" | "global" | "oil" | "flows";
  impact: EventImpact;
  whyItMatters: string;
  typicalBias: BiasDirection;
  biasExplanation: string;
  actionableInsight?: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  isLive?: boolean;
};

// Finnhub API response type
type FinnhubEvent = {
  country: string;
  event: string;
  time: string;
  impact: string;
  actual?: number;
  estimate?: number;
  prev?: number;
  unit?: string;
};

// Map event names to USDINR relevance
const EVENT_RELEVANCE: Record<string, {
  impact: EventImpact;
  category: MarketEvent["category"];
  bias: BiasDirection;
  whyItMatters: string;
  biasExplanation: string;
}> = {
  // US Events - HIGH IMPACT
  "Nonfarm Payrolls": {
    impact: 5,
    category: "us_data",
    bias: "depends",
    whyItMatters: "The biggest market-moving data point. Jobs = US economy health = Fed policy = USD direction.",
    biasExplanation: "Strong jobs (>200K) → USDINR UP. Weak jobs → USDINR DOWN.",
  },
  "CPI": {
    impact: 5,
    category: "us_data",
    bias: "depends",
    whyItMatters: "Inflation is the Fed's #1 focus. CPI surprises move rate expectations instantly.",
    biasExplanation: "Hot CPI → Fed hawkish → USDINR UP. Cool CPI → USDINR DOWN.",
  },
  "Core CPI": {
    impact: 5,
    category: "us_data",
    bias: "depends",
    whyItMatters: "Core CPI excludes food/energy - shows underlying inflation trend. Fed watches this closely.",
    biasExplanation: "Hot Core CPI → USDINR UP. Cool Core CPI → USDINR DOWN.",
  },
  "Fed Interest Rate Decision": {
    impact: 5,
    category: "fed",
    bias: "depends",
    whyItMatters: "The Fed controls USD interest rates. Their dot plots shape market expectations for months.",
    biasExplanation: "Hawkish Fed → USDINR UP. Dovish Fed → USDINR DOWN.",
  },
  "FOMC": {
    impact: 5,
    category: "fed",
    bias: "depends",
    whyItMatters: "Federal Open Market Committee sets monetary policy. Statement language matters as much as rates.",
    biasExplanation: "Hawkish tone → USDINR UP. Dovish tone → USDINR DOWN.",
  },
  "Fed Chair Powell": {
    impact: 4,
    category: "fed",
    bias: "depends",
    whyItMatters: "Powell's speeches often move markets. Markets parse every word for policy clues.",
    biasExplanation: "Hawkish comments → USDINR UP. Dovish comments → USDINR DOWN.",
  },
  "PCE Price Index": {
    impact: 4,
    category: "us_data",
    bias: "depends",
    whyItMatters: "The Fed's preferred inflation gauge. Less volatile than CPI but more policy-relevant.",
    biasExplanation: "Hot PCE → USDINR UP. Cool PCE → USDINR DOWN.",
  },
  "Core PCE": {
    impact: 4,
    category: "us_data",
    bias: "depends",
    whyItMatters: "Fed's favorite inflation metric excluding food/energy. Key for rate decisions.",
    biasExplanation: "Hot Core PCE → USDINR UP. Cool Core PCE → USDINR DOWN.",
  },
  "GDP": {
    impact: 4,
    category: "us_data",
    bias: "depends",
    whyItMatters: "Quarterly GDP shows overall economic growth. Strong growth supports USD.",
    biasExplanation: "Strong GDP → USDINR UP. Weak GDP → USDINR DOWN.",
  },
  "Retail Sales": {
    impact: 3,
    category: "us_data",
    bias: "usdinr_up",
    whyItMatters: "Consumer spending = 70% of US GDP. Strong retail = strong economy.",
    biasExplanation: "Strong retail → USD positive → USDINR UP.",
  },
  "Initial Jobless Claims": {
    impact: 3,
    category: "us_data",
    bias: "depends",
    whyItMatters: "Weekly jobs data. Rising claims = labor market weakness = Fed may cut.",
    biasExplanation: "Low claims → USDINR UP. High claims → USDINR DOWN.",
  },
  "ISM Manufacturing": {
    impact: 3,
    category: "us_data",
    bias: "usdinr_up",
    whyItMatters: "Manufacturing health indicator. Above 50 = expansion.",
    biasExplanation: "Strong ISM → USD positive → USDINR UP.",
  },
  "ISM Services": {
    impact: 3,
    category: "us_data",
    bias: "usdinr_up",
    whyItMatters: "Services sector (80% of US economy) health indicator.",
    biasExplanation: "Strong services → USD positive → USDINR UP.",
  },
  "Unemployment Rate": {
    impact: 4,
    category: "us_data",
    bias: "depends",
    whyItMatters: "Key Fed mandate metric. Low unemployment = strong economy = hawkish Fed.",
    biasExplanation: "Low unemployment → USDINR UP. Rising unemployment → USDINR DOWN.",
  },
  // India Events
  "Interest Rate Decision": {
    impact: 4,
    category: "rbi",
    bias: "depends",
    whyItMatters: "RBI rate decisions directly affect INR. Their FX intervention stance matters too.",
    biasExplanation: "Rate cut → USDINR UP. Rate hike → USDINR DOWN.",
  },
  // Global/Oil
  "Crude Oil Inventories": {
    impact: 3,
    category: "oil",
    bias: "depends",
    whyItMatters: "India imports 85% of oil. Oil price spikes hurt INR.",
    biasExplanation: "Inventory draw → oil up → USDINR UP. Build → USDINR DOWN.",
  },
  "EIA Crude": {
    impact: 3,
    category: "oil",
    bias: "depends",
    whyItMatters: "Weekly US oil inventory data affects global oil prices.",
    biasExplanation: "Draw → bullish oil → USDINR UP. Build → bearish oil → USDINR DOWN.",
  },
};

// Default relevance for unknown events
function getEventRelevance(eventName: string, country: string): typeof EVENT_RELEVANCE[string] | null {
  // Check exact match first
  for (const [key, value] of Object.entries(EVENT_RELEVANCE)) {
    if (eventName.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  // Default relevance by country for high-impact unknown events
  if (country === "US") {
    return {
      impact: 2,
      category: "us_data",
      bias: "depends",
      whyItMatters: "US economic data can affect Fed policy expectations and USD strength.",
      biasExplanation: "Strong data → USD positive. Weak data → USD negative.",
    };
  }
  if (country === "IN") {
    return {
      impact: 2,
      category: "india_data",
      bias: "depends",
      whyItMatters: "India economic data affects RBI policy and INR sentiment.",
      biasExplanation: "Strong data → INR positive. Weak data → INR negative.",
    };
  }

  return null;
}

function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function daysFromNow(eventDate: Date, today: Date): number {
  const diffTime = eventDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  }) + ' ET';
}

// Fetch from Finnhub API
async function fetchFinnhubCalendar(): Promise<FinnhubEvent[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.log("No FINNHUB_API_KEY found, using generated data");
    return [];
  }

  const today = new Date();
  const threeWeeksOut = new Date(today);
  threeWeeksOut.setDate(today.getDate() + 21);

  const fromDate = today.toISOString().split('T')[0];
  const toDate = threeWeeksOut.toISOString().split('T')[0];

  try {
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${fromDate}&to=${toDate}&token=${apiKey}`;
    const response = await fetch(url, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error("Finnhub API error:", response.status);
      return [];
    }

    const data = await response.json();
    return data.economicCalendar || [];
  } catch (error) {
    console.error("Failed to fetch Finnhub calendar:", error);
    return [];
  }
}

// Generate fallback events (when no API key)
function generateFallbackEvents(today: Date): MarketEvent[] {
  const events: MarketEvent[] = [];
  const threeWeeksOut = new Date(today);
  threeWeeksOut.setDate(today.getDate() + 21);

  // Helper to add event
  const addEvent = (
    date: Date,
    event: string,
    category: MarketEvent["category"],
    impact: EventImpact,
    whyItMatters: string,
    typicalBias: BiasDirection,
    biasExplanation: string,
    time?: string,
    actionableInsight?: string
  ) => {
    if (date <= threeWeeksOut && date >= today) {
      events.push({
        id: `gen-${category}-${date.toISOString()}`,
        dateISO: date.toISOString(),
        dateDisplay: formatDate(date),
        daysFromNow: daysFromNow(date, today),
        time,
        event,
        category,
        impact,
        whyItMatters,
        typicalBias,
        biasExplanation,
        actionableInsight,
        isLive: false,
      });
    }
  };

  // First Friday = NFP
  const firstFriday = new Date(today);
  firstFriday.setDate(1);
  while (firstFriday.getDay() !== 5) firstFriday.setDate(firstFriday.getDate() + 1);
  if (firstFriday < today) {
    firstFriday.setMonth(firstFriday.getMonth() + 1);
    firstFriday.setDate(1);
    while (firstFriday.getDay() !== 5) firstFriday.setDate(firstFriday.getDate() + 1);
  }
  addEvent(firstFriday, "US Non-Farm Payrolls (Est.)", "us_data", 5,
    "Jobs data - biggest market mover. Est. date based on typical first Friday release.",
    "depends", "Strong jobs → USDINR UP. Weak jobs → USDINR DOWN.",
    "8:30 AM ET", "Expect 30-50 paisa moves on surprise.");

  // ~12th = CPI
  const cpiDate = new Date(today);
  cpiDate.setDate(12);
  if (cpiDate < today) cpiDate.setMonth(cpiDate.getMonth() + 1);
  addEvent(cpiDate, "US CPI (Est.)", "us_data", 5,
    "Inflation data - Fed's focus. Est. date based on typical mid-month release.",
    "depends", "Hot CPI → USDINR UP. Cool CPI → USDINR DOWN.",
    "8:30 AM ET");

  // Wednesday = Oil
  const nextWed = new Date(today);
  while (nextWed.getDay() !== 3) nextWed.setDate(nextWed.getDate() + 1);
  addEvent(nextWed, "EIA Crude Oil Inventory (Est.)", "oil", 3,
    "Weekly oil data. India imports 85% of oil.",
    "depends", "Draw → oil up → USDINR UP. Build → USDINR DOWN.",
    "10:30 AM ET");

  return events;
}

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Try to fetch live data from Finnhub
  const finnhubEvents = await fetchFinnhubCalendar();

  let events: MarketEvent[] = [];
  let dataSource = "Generated (typical dates)";

  if (finnhubEvents.length > 0) {
    dataSource = "Finnhub API (Live)";

    // Process Finnhub events
    for (const fe of finnhubEvents) {
      // Filter for US and India only (relevant to USDINR)
      if (fe.country !== "US" && fe.country !== "IN") continue;

      const relevance = getEventRelevance(fe.event, fe.country);
      if (!relevance) continue;

      // Skip low impact events
      if (relevance.impact < 2) continue;

      const eventDate = new Date(fe.time);
      const days = daysFromNow(eventDate, today);

      // Only include future events (up to 21 days)
      if (days < 0 || days > 21) continue;

      events.push({
        id: `live-${fe.country}-${fe.event}-${fe.time}`,
        dateISO: fe.time,
        dateDisplay: formatDate(eventDate),
        daysFromNow: days,
        time: formatTime(fe.time),
        event: fe.event,
        category: relevance.category,
        impact: relevance.impact,
        whyItMatters: relevance.whyItMatters,
        typicalBias: relevance.bias,
        biasExplanation: relevance.biasExplanation,
        actual: fe.actual !== undefined ? `${fe.actual}${fe.unit || ''}` : undefined,
        forecast: fe.estimate !== undefined ? `${fe.estimate}${fe.unit || ''}` : undefined,
        previous: fe.prev !== undefined ? `${fe.prev}${fe.unit || ''}` : undefined,
        isLive: true,
      });
    }
  }

  // Fall back to generated events if no live data
  if (events.length === 0) {
    events = generateFallbackEvents(today);
  }

  // Sort by date, then by impact
  events.sort((a, b) => {
    const dateDiff = new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.impact - a.impact;
  });

  // Deduplicate similar events on same day
  const seen = new Set<string>();
  events = events.filter(e => {
    const key = `${e.dateDisplay}-${e.event.split(' ')[0]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Fetch FX data for predictions
  let predictions = null;
  try {
    const fxData = await fetchFxRates();
    if (fxData && fxData.spot) {
      const spot = fxData.spot;
      const fwd1m = fxData.fwd1m || spot;
      const fwd3m = fxData.fwd3m || spot;

      const fwd1mPoints = fwd1m - spot;
      const fwd3mPoints = fwd3m - spot;
      const dailyDrift = fwd1mPoints / 30;

      const bias = fwd1mPoints > 0.05 ? "usdinr_up" : fwd1mPoints < -0.05 ? "usdinr_down" : "neutral";

      predictions = {
        currentSpot: spot,
        forward1m: fwd1m,
        forward3m: fwd3m,
        predictions: {
          "1_day": {
            level: Number((spot + dailyDrift).toFixed(4)),
            change: Number(dailyDrift.toFixed(4)),
            changePct: Number((dailyDrift / spot * 100).toFixed(3)),
          },
          "3_day": {
            level: Number((spot + dailyDrift * 3).toFixed(4)),
            change: Number((dailyDrift * 3).toFixed(4)),
            changePct: Number((dailyDrift * 3 / spot * 100).toFixed(3)),
          },
          "1_week": {
            level: Number((spot + dailyDrift * 7).toFixed(4)),
            change: Number((dailyDrift * 7).toFixed(4)),
            changePct: Number((dailyDrift * 7 / spot * 100).toFixed(3)),
          },
          "1_month": {
            level: Number(fwd1m.toFixed(4)),
            change: Number(fwd1mPoints.toFixed(4)),
            changePct: Number((fwd1mPoints / spot * 100).toFixed(3)),
          },
        },
        forwardPoints: { "1m": Number(fwd1mPoints.toFixed(4)), "3m": Number(fwd3mPoints.toFixed(4)) },
        impliedCarryPct: {
          "1m_annualized": Number(((fwd1m - spot) / spot * 12 * 100).toFixed(2)),
          "3m_annualized": Number(((fwd3m - spot) / spot * 4 * 100).toFixed(2)),
        },
        marketBias: bias,
        biasExplanation: bias === "usdinr_up"
          ? "Forward curve shows positive carry - market expects USDINR to drift higher"
          : bias === "usdinr_down"
          ? "Forward curve shows negative carry - market expects USDINR to drift lower"
          : "Forward curve relatively flat - no strong directional signal",
        methodology: "Predictions based on forward curve interpolation. Forward points reflect USD-INR interest rate differential.",
        disclaimer: "Forward-implied only. Event risk (NFP, CPI, Fed, RBI) can cause significant divergence.",
      };
    }
  } catch (error) {
    console.error("Failed to fetch FX data for predictions:", error);
  }

  // Market context
  const marketContext = {
    keyDrivers: [
      { driver: "US Federal Reserve", currentStance: "Data-dependent", impactOnUsdinr: "Hawkish = USDINR up" },
      { driver: "Crude Oil", currentStance: "Watch $75-85 Brent", impactOnUsdinr: "Oil >$85 = INR pressure" },
      { driver: "FII Flows", currentStance: "Track daily on NSE", impactOnUsdinr: "Outflows = INR weak" },
      { driver: "DXY Index", currentStance: "Key: 104-105", impactOnUsdinr: "DXY >105 = USDINR >84" },
    ],
    quickTake: "USDINR driven by Fed policy and DXY. RBI provides floor ~82.80-83.00, but USD strength can push to 84.50+.",
  };

  const hasApiKey = !!process.env.FINNHUB_API_KEY;

  return NextResponse.json({
    events,
    predictions,
    marketContext,
    generatedAt: new Date().toISOString(),
    dataSource,
    isLive: finnhubEvents.length > 0,
    apiKeyConfigured: hasApiKey,
    setupInstructions: !hasApiKey ? {
      message: "For live economic calendar data, add your free Finnhub API key",
      steps: [
        "1. Sign up at https://finnhub.io (free)",
        "2. Copy your API key from the dashboard",
        "3. Add to .env.local: FINNHUB_API_KEY=your_key_here",
        "4. Restart the dev server",
      ],
    } : undefined,
  });
}
