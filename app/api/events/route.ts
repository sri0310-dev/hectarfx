import { NextResponse } from "next/server";
import { fetchFxRates } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * USDINR Event Watch - First Principles Approach
 *
 * Key Drivers (ranked by typical USDINR volatility impact):
 * 1. US Federal Reserve / FOMC - ★★★★★
 * 2. US Non-Farm Payrolls - ★★★★★
 * 3. US CPI Inflation - ★★★★★
 * 4. RBI MPC Decisions - ★★★★☆
 * 5. Crude Oil - ★★★★☆
 * 6. US Retail Sales / PCE - ★★★☆☆
 * 7. India Trade Balance - ★★★☆☆
 */

type EventImpact = 1 | 2 | 3 | 4 | 5;
type BiasDirection = "usdinr_up" | "usdinr_down" | "volatile" | "depends";

export type MarketEvent = {
  id: string;
  dateISO: string; // For parsing
  dateDisplay: string; // For display
  daysFromNow: number;
  time?: string;
  event: string;
  category: "fed" | "us_data" | "rbi" | "india_data" | "global" | "oil" | "flows";
  impact: EventImpact;
  whyItMatters: string;
  typicalBias: BiasDirection;
  biasExplanation: string;
  actionableInsight?: string;
};

// Date helpers
function getNextDayOfMonth(fromDate: Date, targetDay: number): Date {
  const result = new Date(fromDate);
  result.setDate(targetDay);
  result.setHours(0, 0, 0, 0);
  if (result <= fromDate) {
    result.setMonth(result.getMonth() + 1);
  }
  return result;
}

function getFirstFriday(fromDate: Date): Date {
  const thisMonth = new Date(fromDate);
  thisMonth.setDate(1);
  while (thisMonth.getDay() !== 5) {
    thisMonth.setDate(thisMonth.getDate() + 1);
  }
  if (thisMonth > fromDate) return thisMonth;

  const nextMonth = new Date(fromDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  while (nextMonth.getDay() !== 5) {
    nextMonth.setDate(nextMonth.getDate() + 1);
  }
  return nextMonth;
}

function getNextFomc(fromDate: Date): Date {
  // 2025-2026 FOMC dates
  const fomcDates = [
    new Date(2025, 0, 29), new Date(2025, 2, 19), new Date(2025, 4, 7),
    new Date(2025, 5, 18), new Date(2025, 6, 30), new Date(2025, 8, 17),
    new Date(2025, 10, 5), new Date(2025, 11, 17),
    new Date(2026, 0, 28), new Date(2026, 2, 18), new Date(2026, 4, 6),
    new Date(2026, 5, 17), new Date(2026, 6, 29), new Date(2026, 8, 16),
    new Date(2026, 10, 4), new Date(2026, 11, 16),
  ];
  for (const d of fomcDates) {
    if (d > fromDate) return d;
  }
  // Fallback: 6 weeks out
  const fb = new Date(fromDate);
  fb.setDate(fb.getDate() + 42);
  return fb;
}

function getNextRbi(fromDate: Date): Date {
  // RBI MPC: Feb, Apr, Jun, Aug, Oct, Dec - first week
  const rbiMonths = [1, 3, 5, 7, 9, 11];
  for (let i = 0; i < 12; i++) {
    const checkDate = new Date(fromDate);
    checkDate.setMonth(fromDate.getMonth() + i);
    if (rbiMonths.includes(checkDate.getMonth())) {
      checkDate.setDate(7);
      if (checkDate > fromDate) return checkDate;
    }
  }
  const fb = new Date(fromDate);
  fb.setMonth(fb.getMonth() + 2);
  fb.setDate(7);
  return fb;
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

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeWeeksOut = new Date(today);
  threeWeeksOut.setDate(today.getDate() + 21);

  // Fetch live FX data for predictions
  let fxData: { spot: number; fwd1m: number; fwd2m: number; fwd3m: number } | null = null;
  try {
    fxData = await fetchFxRates();
  } catch {
    // Continue without FX data
  }

  const events: MarketEvent[] = [];

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
        id: `${category}-${date.toISOString()}`,
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
      });
    }
  };

  // ===== HIGH IMPACT (★★★★★) =====

  addEvent(
    getFirstFriday(today),
    "US Non-Farm Payrolls",
    "us_data",
    5,
    "The single biggest market-moving data point. Jobs = US economic health = Fed policy expectations = USD strength.",
    "depends",
    "Strong jobs (>200K, low unemployment) → USDINR UP. Weak jobs → USDINR DOWN.",
    "8:30 AM ET",
    "Expect 30-50 paisa moves. Consider hedging before NFP if you have INR payables."
  );

  addEvent(
    getNextDayOfMonth(today, 12),
    "US CPI Inflation",
    "us_data",
    5,
    "Inflation is the Fed's #1 focus. CPI surprises move rate expectations instantly.",
    "depends",
    "Hot CPI (above consensus) → Fed stays hawkish → USDINR UP. Cool CPI → USDINR DOWN.",
    "8:30 AM ET",
    "CPI can move USDINR 40-60 paisa in hours. High-stakes event for hedging decisions."
  );

  addEvent(
    getNextFomc(today),
    "FOMC Rate Decision",
    "fed",
    5,
    "The Fed controls USD interest rates. Dot plot projections shape market expectations for months.",
    "depends",
    "Hawkish Fed (rates higher/longer) → USDINR UP. Dovish Fed (rate cuts coming) → USDINR DOWN.",
    "2:00 PM ET",
    "FOMC days are volatile. If neutral on hedging, wait 24-48 hours for dust to settle."
  );

  // ===== HIGH IMPACT (★★★★) =====

  addEvent(
    getNextRbi(today),
    "RBI MPC Decision",
    "rbi",
    4,
    "RBI rate decisions directly affect INR. Their FX intervention stance matters too.",
    "depends",
    "Rate cut → USDINR UP (INR weakens). Rate hike or hawkish hold → USDINR DOWN.",
    "10:00 AM IST",
    "Watch RBI's commentary on rupee management - sometimes more important than the rate."
  );

  // ===== MEDIUM IMPACT (★★★) =====

  // Next Wednesday for oil
  const nextWed = new Date(today);
  while (nextWed.getDay() !== 3) nextWed.setDate(nextWed.getDate() + 1);

  addEvent(
    nextWed,
    "EIA Crude Oil Inventory",
    "oil",
    3,
    "Weekly oil data. India imports 85% of oil - price spikes directly hurt INR.",
    "depends",
    "Inventory draw → oil up → USDINR UP. Inventory build → oil down → USDINR DOWN.",
    "10:30 AM ET",
    "Oil above $85/bbl is INR negative. Below $75/bbl is INR supportive."
  );

  addEvent(
    getNextDayOfMonth(today, 15),
    "India Trade Balance",
    "india_data",
    3,
    "Trade deficit = structural INR selling pressure. Oil import bill is the key driver.",
    "usdinr_up",
    "Widening deficit → USDINR UP. Narrowing deficit (rare) → USDINR DOWN."
  );

  addEvent(
    getNextDayOfMonth(today, 16),
    "US Retail Sales",
    "us_data",
    3,
    "Consumer spending = 70% of US GDP. Strong retail = strong economy = USD support.",
    "usdinr_up",
    "Strong retail → USD positive → USDINR UP. Impact less than NFP/CPI.",
    "8:30 AM ET"
  );

  addEvent(
    getNextDayOfMonth(today, 28),
    "US PCE Price Index",
    "us_data",
    3,
    "The Fed's favorite inflation gauge. Less volatile than CPI but more policy-relevant.",
    "depends",
    "Hot PCE → Fed hawkish → USDINR UP. Cool PCE → USDINR DOWN.",
    "8:30 AM ET"
  );

  // ===== LOWER IMPACT (★★) =====

  addEvent(
    getNextDayOfMonth(today, 12),
    "India CPI Inflation",
    "india_data",
    2,
    "Feeds into RBI's rate decisions. High inflation may force RBI's hand.",
    "volatile",
    "High inflation → RBI may hike → INR support. But also signals economic stress."
  );

  // Sort by date
  events.sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());

  // ===== USDINR PREDICTIONS using Forward Curve =====
  let predictions = null;
  if (fxData && fxData.spot) {
    const spot = fxData.spot;
    const fwd1m = fxData.fwd1m || spot;
    const fwd3m = fxData.fwd3m || spot;

    // Forward points imply market's directional expectation
    const fwd1mPoints = fwd1m - spot;
    const fwd3mPoints = fwd3m - spot;

    // Implied annualized carry (rough)
    const impliedCarry1m = ((fwd1m - spot) / spot) * 12 * 100;
    const impliedCarry3m = ((fwd3m - spot) / spot) * 4 * 100;

    // Simple interpolations for 1d, 3d, 1w
    const dailyDrift = fwd1mPoints / 30;
    const pred1d = spot + dailyDrift;
    const pred3d = spot + (dailyDrift * 3);
    const pred1w = spot + (dailyDrift * 7);

    // Determine bias
    const bias = fwd1mPoints > 0.05 ? "usdinr_up" : fwd1mPoints < -0.05 ? "usdinr_down" : "neutral";

    predictions = {
      currentSpot: spot,
      forward1m: fwd1m,
      forward3m: fwd3m,
      predictions: {
        "1_day": {
          level: Number(pred1d.toFixed(4)),
          change: Number((pred1d - spot).toFixed(4)),
          changePct: Number(((pred1d - spot) / spot * 100).toFixed(3)),
        },
        "3_day": {
          level: Number(pred3d.toFixed(4)),
          change: Number((pred3d - spot).toFixed(4)),
          changePct: Number(((pred3d - spot) / spot * 100).toFixed(3)),
        },
        "1_week": {
          level: Number(pred1w.toFixed(4)),
          change: Number((pred1w - spot).toFixed(4)),
          changePct: Number(((pred1w - spot) / spot * 100).toFixed(3)),
        },
        "1_month": {
          level: Number(fwd1m.toFixed(4)),
          change: Number(fwd1mPoints.toFixed(4)),
          changePct: Number(((fwd1m - spot) / spot * 100).toFixed(3)),
        },
      },
      forwardPoints: {
        "1m": Number(fwd1mPoints.toFixed(4)),
        "3m": Number(fwd3mPoints.toFixed(4)),
      },
      impliedCarryPct: {
        "1m_annualized": Number(impliedCarry1m.toFixed(2)),
        "3m_annualized": Number(impliedCarry3m.toFixed(2)),
      },
      marketBias: bias,
      biasExplanation: bias === "usdinr_up"
        ? "Forward curve shows positive carry - market expects USDINR to drift higher"
        : bias === "usdinr_down"
        ? "Forward curve shows negative carry - market expects USDINR to drift lower"
        : "Forward curve relatively flat - no strong directional signal",
      methodology: "Predictions based on linear interpolation of forward curve. Forward points reflect interest rate differential (USD vs INR rates). Positive forward points = INR expected to depreciate.",
      disclaimer: "Forward-implied predictions assume no major data surprises. Actual moves can diverge significantly during event risk (NFP, CPI, FOMC, RBI).",
    };
  }

  // Market context
  const marketContext = {
    keyDrivers: [
      {
        driver: "US Federal Reserve",
        currentStance: "Data-dependent, watching inflation",
        impactOnUsdinr: "Hawkish lean supports USD, keeps USDINR elevated"
      },
      {
        driver: "Crude Oil",
        currentStance: "Monitor Brent $75-85 range",
        impactOnUsdinr: "Sustained oil above $85 = INR pressure"
      },
      {
        driver: "FII Flows",
        currentStance: "Track daily FII data on NSE",
        impactOnUsdinr: "Sustained outflows = INR weakness"
      },
      {
        driver: "DXY (Dollar Index)",
        currentStance: "Key level: 104-105 range",
        impactOnUsdinr: "DXY above 105 = USDINR likely above 84"
      }
    ],
    quickTake: "USDINR direction is primarily driven by Fed policy expectations and DXY. RBI intervention provides a floor around 82.80-83.00, but sustained USD strength can push pair to 84.50+."
  };

  return NextResponse.json({
    events,
    predictions,
    marketContext,
    generatedAt: new Date().toISOString(),
    methodology: "Events ranked by historical USDINR volatility impact. Predictions derived from forward curve (interest rate differential).",
    dataSource: "Event dates are typical release schedules. Predictions use live forward rates from FXStrat sheet.",
  });
}
