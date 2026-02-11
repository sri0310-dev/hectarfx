import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * USDINR Event Watch - First Principles Approach
 *
 * What actually moves USDINR the most?
 *
 * 1. US FEDERAL RESERVE (★★★★★)
 *    - FOMC decisions, Fed speeches, dot plots
 *    - Why: USD is the base currency. Fed policy = USD strength/weakness globally
 *
 * 2. US NON-FARM PAYROLLS (★★★★★)
 *    - First Friday of each month
 *    - Why: Jobs = economy health = Fed policy path = USD direction
 *
 * 3. US CPI / INFLATION (★★★★★)
 *    - Monthly release ~12th-15th
 *    - Why: Inflation drives Fed reaction function. Hot CPI = hawkish Fed = strong USD
 *
 * 4. RBI MONETARY POLICY (★★★★☆)
 *    - Bi-monthly (Feb, Apr, Jun, Aug, Oct, Dec)
 *    - Why: Direct INR impact. Rate cuts weaken INR, hikes strengthen
 *
 * 5. CRUDE OIL PRICES (★★★★☆)
 *    - Continuous but key inventory/OPEC dates
 *    - Why: India imports ~85% of oil. Oil up = trade deficit up = INR down
 *
 * 6. DXY (DOLLAR INDEX) (★★★★☆)
 *    - Continuous, but Fed-event driven
 *    - Why: USDINR has ~0.7-0.8 correlation with DXY. DXY up = USDINR up
 *
 * 7. FII/FPI FLOWS (★★★☆☆)
 *    - Daily data, but monthly trends matter
 *    - Why: Foreign capital in/out of India equity/debt = INR demand/supply
 *
 * 8. US TREASURY YIELDS (★★★☆☆)
 *    - Continuous, auction-driven spikes
 *    - Why: Higher US yields attract capital from EM = EM currency weakness
 *
 * 9. INDIA TRADE BALANCE (★★★☆☆)
 *    - Monthly ~15th
 *    - Why: Trade deficit = structural INR selling pressure
 *
 * 10. RISK SENTIMENT / VIX (★★★☆☆)
 *     - Continuous
 *     - Why: Risk-off = EM sell-off = INR weakness
 */

type EventImpact = 1 | 2 | 3 | 4 | 5;
type BiasDirection = "usdinr_up" | "usdinr_down" | "volatile" | "depends";

export type MarketEvent = {
  id: string;
  date: string;
  time?: string; // e.g., "8:30 AM ET"
  event: string;
  category: "fed" | "us_data" | "rbi" | "india_data" | "global" | "oil" | "flows";
  impact: EventImpact; // 1-5 stars
  whyItMatters: string;
  typicalBias: BiasDirection;
  biasExplanation: string;
  actionableInsight?: string;
};

// Get next occurrence of a specific day of month
function getNextDayOfMonth(fromDate: Date, targetDay: number): Date {
  const result = new Date(fromDate);
  result.setDate(targetDay);
  result.setHours(0, 0, 0, 0);

  if (result <= fromDate) {
    result.setMonth(result.getMonth() + 1);
  }
  return result;
}

// Get first Friday of month
function getFirstFriday(fromDate: Date): Date {
  const result = new Date(fromDate);
  result.setMonth(result.getMonth() + 1);
  result.setDate(1);

  while (result.getDay() !== 5) {
    result.setDate(result.getDate() + 1);
  }

  // If we're past this month's first Friday, get next month's
  const thisMonthFirstFriday = new Date(fromDate);
  thisMonthFirstFriday.setDate(1);
  while (thisMonthFirstFriday.getDay() !== 5) {
    thisMonthFirstFriday.setDate(thisMonthFirstFriday.getDate() + 1);
  }

  if (thisMonthFirstFriday > fromDate) {
    return thisMonthFirstFriday;
  }
  return result;
}

// Get third Wednesday of month (typical FOMC)
function getThirdWednesday(fromDate: Date): Date {
  const result = new Date(fromDate);
  result.setDate(1);

  // Find first Wednesday
  while (result.getDay() !== 3) {
    result.setDate(result.getDate() + 1);
  }
  // Add 2 weeks for third Wednesday
  result.setDate(result.getDate() + 14);

  if (result <= fromDate) {
    result.setMonth(result.getMonth() + 1);
    result.setDate(1);
    while (result.getDay() !== 3) {
      result.setDate(result.getDate() + 1);
    }
    result.setDate(result.getDate() + 14);
  }
  return result;
}

// FOMC meetings - approximately 8 per year
function getNextFomc(fromDate: Date): Date {
  // 2025-2026 FOMC dates (approximate - actual schedule varies)
  const fomcDates = [
    // 2025
    new Date(2025, 0, 29), new Date(2025, 2, 19), new Date(2025, 4, 7),
    new Date(2025, 5, 18), new Date(2025, 6, 30), new Date(2025, 8, 17),
    new Date(2025, 10, 5), new Date(2025, 11, 17),
    // 2026
    new Date(2026, 0, 28), new Date(2026, 2, 18), new Date(2026, 4, 6),
    new Date(2026, 5, 17), new Date(2026, 6, 29), new Date(2026, 8, 16),
    new Date(2026, 10, 4), new Date(2026, 11, 16),
  ];

  for (const d of fomcDates) {
    if (d > fromDate) return d;
  }
  return getThirdWednesday(fromDate);
}

// RBI MPC meetings - bi-monthly
function getNextRbi(fromDate: Date): Date {
  // RBI typically announces first week of Feb, Apr, Jun, Aug, Oct, Dec
  const rbiMonths = [1, 3, 5, 7, 9, 11]; // Feb, Apr, Jun, Aug, Oct, Dec (0-indexed)

  for (let i = 0; i < 12; i++) {
    const checkDate = new Date(fromDate);
    checkDate.setMonth(fromDate.getMonth() + i);

    if (rbiMonths.includes(checkDate.getMonth())) {
      checkDate.setDate(7); // First week
      if (checkDate > fromDate) return checkDate;
    }
  }

  const fallback = new Date(fromDate);
  fallback.setMonth(fallback.getMonth() + 2);
  fallback.setDate(7);
  return fallback;
}

// Format date for display
function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

// Calculate days from now
function daysFromNow(date: Date, today: Date): number {
  const diffTime = date.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const threeWeeksFromNow = new Date(today);
  threeWeeksFromNow.setDate(today.getDate() + 21);

  const events: MarketEvent[] = [];

  // ========== HIGH IMPACT: FED & US DATA ==========

  // US Non-Farm Payrolls (First Friday) - ★★★★★
  const nfpDate = getFirstFriday(today);
  if (nfpDate <= threeWeeksFromNow) {
    events.push({
      id: `nfp-${nfpDate.toISOString()}`,
      date: formatDate(nfpDate),
      time: "8:30 AM ET",
      event: "US Non-Farm Payrolls",
      category: "us_data",
      impact: 5,
      whyItMatters: "The single biggest market-moving data point. Jobs = US economic health = Fed policy expectations = USD strength.",
      typicalBias: "depends",
      biasExplanation: "Strong jobs (>200K, low unemployment) → USDINR UP. Weak jobs → USDINR DOWN.",
      actionableInsight: "If you have INR payables, consider hedging before NFP if consensus is bullish. Expect 30-50 paisa moves."
    });
  }

  // US CPI (Usually 12th-14th) - ★★★★★
  const cpiDate = getNextDayOfMonth(today, 13);
  if (cpiDate <= threeWeeksFromNow) {
    events.push({
      id: `cpi-${cpiDate.toISOString()}`,
      date: formatDate(cpiDate),
      time: "8:30 AM ET",
      event: "US CPI Inflation",
      category: "us_data",
      impact: 5,
      whyItMatters: "Inflation is the Fed's #1 focus. CPI surprises move rate expectations instantly, which moves USD instantly.",
      typicalBias: "depends",
      biasExplanation: "Hot CPI (higher than expected) → Fed stays hawkish → USDINR UP. Cool CPI → USDINR DOWN.",
      actionableInsight: "CPI can move USDINR 40-60 paisa in hours. High-stakes hedging decisions should account for this."
    });
  }

  // FOMC Decision - ★★★★★
  const fomcDate = getNextFomc(today);
  if (fomcDate <= threeWeeksFromNow) {
    events.push({
      id: `fomc-${fomcDate.toISOString()}`,
      date: formatDate(fomcDate),
      time: "2:00 PM ET",
      event: "FOMC Rate Decision",
      category: "fed",
      impact: 5,
      whyItMatters: "The Fed controls USD interest rates. Their dot plot projections shape market expectations for months ahead.",
      typicalBias: "depends",
      biasExplanation: "Hawkish Fed (higher rates/longer) → USDINR UP. Dovish Fed (rate cuts coming) → USDINR DOWN.",
      actionableInsight: "FOMC days are volatile. If neutral on hedging, wait 24-48 hours for dust to settle."
    });
  }

  // ========== HIGH IMPACT: RBI ==========

  // RBI MPC Decision - ★★★★☆
  const rbiDate = getNextRbi(today);
  if (rbiDate <= threeWeeksFromNow) {
    events.push({
      id: `rbi-${rbiDate.toISOString()}`,
      date: formatDate(rbiDate),
      time: "10:00 AM IST",
      event: "RBI MPC Decision",
      category: "rbi",
      impact: 4,
      whyItMatters: "RBI rate decisions directly affect INR. Plus, RBI intervenes in FX markets - their stance matters.",
      typicalBias: "depends",
      biasExplanation: "Rate cut → USDINR UP (INR weakens). Rate hike or hawkish hold → USDINR DOWN (INR strengthens).",
      actionableInsight: "Watch RBI's commentary on rupee management and forex reserves - sometimes more important than the rate itself."
    });
  }

  // ========== MEDIUM IMPACT: ONGOING DRIVERS ==========

  // US Retail Sales - ★★★☆☆
  const retailDate = getNextDayOfMonth(today, 16);
  if (retailDate <= threeWeeksFromNow) {
    events.push({
      id: `retail-${retailDate.toISOString()}`,
      date: formatDate(retailDate),
      time: "8:30 AM ET",
      event: "US Retail Sales",
      category: "us_data",
      impact: 3,
      whyItMatters: "Consumer spending = 70% of US GDP. Strong retail = strong economy = USD support.",
      typicalBias: "usdinr_up",
      biasExplanation: "Strong retail sales typically USD positive → USDINR UP. But impact is less than NFP/CPI.",
    });
  }

  // India Trade Balance - ★★★☆☆
  const tradeDate = getNextDayOfMonth(today, 15);
  if (tradeDate <= threeWeeksFromNow) {
    events.push({
      id: `trade-${tradeDate.toISOString()}`,
      date: formatDate(tradeDate),
      event: "India Trade Balance",
      category: "india_data",
      impact: 3,
      whyItMatters: "Trade deficit = INR selling pressure. Oil import bill is the key driver to watch.",
      typicalBias: "usdinr_up",
      biasExplanation: "Widening deficit → USDINR UP. Narrowing deficit (rare) → USDINR DOWN.",
      actionableInsight: "Watch oil prices alongside trade data - high oil + wide deficit = INR under pressure."
    });
  }

  // US PCE (Fed's preferred inflation) - ★★★☆☆
  const pceDate = getNextDayOfMonth(today, 28);
  if (pceDate <= threeWeeksFromNow) {
    events.push({
      id: `pce-${pceDate.toISOString()}`,
      date: formatDate(pceDate),
      time: "8:30 AM ET",
      event: "US PCE Price Index",
      category: "us_data",
      impact: 3,
      whyItMatters: "The Fed's favorite inflation gauge. Less volatile than CPI but more policy-relevant.",
      typicalBias: "depends",
      biasExplanation: "Hot PCE → Fed hawkish → USDINR UP. Cool PCE → USDINR DOWN.",
    });
  }

  // India CPI - ★★☆☆☆
  const indiaCpiDate = getNextDayOfMonth(today, 12);
  if (indiaCpiDate <= threeWeeksFromNow) {
    events.push({
      id: `india-cpi-${indiaCpiDate.toISOString()}`,
      date: formatDate(indiaCpiDate),
      event: "India CPI Inflation",
      category: "india_data",
      impact: 2,
      whyItMatters: "Feeds into RBI's rate decisions. High inflation may force RBI's hand on rates.",
      typicalBias: "volatile",
      biasExplanation: "High inflation → RBI may hike → INR support. But also signals economic stress.",
    });
  }

  // Weekly: EIA Oil Inventory - ★★★☆☆
  const nextWednesday = new Date(today);
  while (nextWednesday.getDay() !== 3) {
    nextWednesday.setDate(nextWednesday.getDate() + 1);
  }
  if (nextWednesday <= threeWeeksFromNow) {
    events.push({
      id: `oil-${nextWednesday.toISOString()}`,
      date: formatDate(nextWednesday),
      time: "10:30 AM ET",
      event: "EIA Crude Oil Inventory",
      category: "oil",
      impact: 3,
      whyItMatters: "Weekly oil data. India imports 85% of oil needs - price spikes hurt INR.",
      typicalBias: "depends",
      biasExplanation: "Inventory draw (bullish oil) → oil up → USDINR UP. Build (bearish oil) → USDINR DOWN.",
      actionableInsight: "Oil above $85/bbl is INR negative. Below $75/bbl is INR supportive."
    });
  }

  // Sort by date
  events.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateA.getTime() - dateB.getTime();
  });

  // Add days from now
  const eventsWithDays = events.map(event => {
    const eventDate = new Date(event.date);
    return {
      ...event,
      daysFromNow: daysFromNow(eventDate, today),
    };
  });

  // Market context summary
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
    events: eventsWithDays,
    marketContext,
    generatedAt: new Date().toISOString(),
    methodology: "Events ranked by historical USDINR volatility impact. Fed/NFP/CPI are tier-1 movers. RBI and oil are tier-2.",
  });
}
