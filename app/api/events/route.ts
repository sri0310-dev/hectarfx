import { NextResponse } from "next/server";
import { fetchSpotFromSheet } from "@/lib/sheets";
import { forwardRate } from "@/lib/fx";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * USDINR Event Watch
 * - Curated economic calendar with real scheduled dates
 * - Live market signals (DXY, Oil, Yields, VIX) for direction
 * - Forward curve predictions
 */

type EventCategory = "fed" | "us_data" | "rbi" | "india_data" | "oil";
type BiasDirection = "usdinr_up" | "usdinr_down" | "volatile" | "depends";

export type MarketEvent = {
  id: string;
  date: string;
  time: string;
  event: string;
  category: EventCategory;
  impact: 1 | 2 | 3 | 4 | 5;
  whyItMatters: string;
  typicalBias: BiasDirection;
  biasExplanation: string;
  tradingTip?: string;
};

// ─── LIVE MARKET DATA ───
// Fetch from Yahoo Finance (free, no API key)
type MarketSignal = {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePct: number;
  signal: "bullish" | "bearish" | "neutral";
  usdinrBias: "up" | "down" | "neutral";
  reasoning: string;
};

async function fetchYahooQuote(symbol: string): Promise<{ price: number; change: number; changePct: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 300 }, // Cache 5 min
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta.regularMarketPrice || meta.previousClose;
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const change = price - prevClose;
    const changePct = (change / prevClose) * 100;

    return { price, change, changePct };
  } catch {
    return null;
  }
}

async function fetchMarketSignals(): Promise<MarketSignal[]> {
  const signals: MarketSignal[] = [];

  // Fetch all in parallel
  const [dxy, brent, tnx, vix] = await Promise.all([
    fetchYahooQuote("DX-Y.NYB"),  // Dollar Index
    fetchYahooQuote("BZ=F"),      // Brent Crude
    fetchYahooQuote("%5ETNX"),    // 10Y Treasury (^TNX encoded)
    fetchYahooQuote("%5EVIX"),    // VIX (^VIX encoded)
  ]);

  // DXY - Dollar Index
  if (dxy) {
    const signal = dxy.changePct > 0.2 ? "bullish" : dxy.changePct < -0.2 ? "bearish" : "neutral";
    signals.push({
      symbol: "DXY",
      name: "Dollar Index",
      value: Number(dxy.price.toFixed(2)),
      change: Number(dxy.change.toFixed(2)),
      changePct: Number(dxy.changePct.toFixed(2)),
      signal,
      usdinrBias: signal === "bullish" ? "up" : signal === "bearish" ? "down" : "neutral",
      reasoning: signal === "bullish" ? "Strong USD globally" : signal === "bearish" ? "Weak USD globally" : "USD stable",
    });
  }

  // Brent Crude
  if (brent) {
    const signal = brent.changePct > 1 ? "bullish" : brent.changePct < -1 ? "bearish" : "neutral";
    signals.push({
      symbol: "BRENT",
      name: "Brent Crude",
      value: Number(brent.price.toFixed(2)),
      change: Number(brent.change.toFixed(2)),
      changePct: Number(brent.changePct.toFixed(2)),
      signal,
      usdinrBias: signal === "bullish" ? "up" : signal === "bearish" ? "down" : "neutral", // Oil up = INR weak
      reasoning: signal === "bullish" ? "Oil rising, INR under pressure" : signal === "bearish" ? "Oil falling, INR relief" : "Oil stable",
    });
  }

  // US 10Y Yield
  if (tnx) {
    const signal = tnx.change > 0.03 ? "bullish" : tnx.change < -0.03 ? "bearish" : "neutral";
    signals.push({
      symbol: "US10Y",
      name: "US 10Y Yield",
      value: Number(tnx.price.toFixed(2)),
      change: Number((tnx.change).toFixed(2)),
      changePct: Number(tnx.changePct.toFixed(2)),
      signal,
      usdinrBias: signal === "bullish" ? "up" : signal === "bearish" ? "down" : "neutral",
      reasoning: signal === "bullish" ? "Yields up, USD attractive" : signal === "bearish" ? "Yields down, USD less attractive" : "Yields stable",
    });
  }

  // VIX - Fear Index
  if (vix) {
    const isHighVix = vix.price > 20;
    const signal = vix.changePct > 5 ? "bullish" : vix.changePct < -5 ? "bearish" : "neutral";
    signals.push({
      symbol: "VIX",
      name: "Fear Index",
      value: Number(vix.price.toFixed(2)),
      change: Number(vix.change.toFixed(2)),
      changePct: Number(vix.changePct.toFixed(2)),
      signal,
      usdinrBias: (signal === "bullish" || isHighVix) ? "up" : signal === "bearish" ? "down" : "neutral", // High VIX = risk-off = EM weak
      reasoning: isHighVix ? "Risk-off mode, EM currencies weak" : signal === "bullish" ? "Fear rising, risk-off" : signal === "bearish" ? "Fear falling, risk-on" : "Markets calm",
    });
  }

  return signals;
}

// ─── CURATED 2026 ECONOMIC CALENDAR ───
function get2026Calendar(): Omit<MarketEvent, "id">[] {
  return [
    // FEBRUARY 2026
    { date: "2026-02-12", time: "08:30", event: "US Initial Jobless Claims", category: "us_data", impact: 3, whyItMatters: "Weekly labor market health check. Rising claims signal economic weakness.", typicalBias: "depends", biasExplanation: "Low claims (<220K) → USD strong → USDINR UP. High claims (>250K) → USDINR DOWN." },
    { date: "2026-02-12", time: "08:30", event: "US CPI (Jan)", category: "us_data", impact: 5, whyItMatters: "CRITICAL: January inflation data. Sets the tone for Fed policy all year.", typicalBias: "depends", biasExplanation: "Hot CPI (>0.3% MoM) → Hawkish Fed → USDINR UP. Cool CPI → USDINR DOWN.", tradingTip: "Expect 30-50 paisa moves on surprise. Position light before release." },
    { date: "2026-02-13", time: "08:30", event: "US Retail Sales (Jan)", category: "us_data", impact: 4, whyItMatters: "Consumer spending = 70% of US economy. Shows economic momentum.", typicalBias: "usdinr_up", biasExplanation: "Strong retail → economic strength → USD positive → USDINR UP." },
    { date: "2026-02-14", time: "08:30", event: "US PPI (Jan)", category: "us_data", impact: 3, whyItMatters: "Producer prices feed into consumer inflation. Leading indicator for CPI.", typicalBias: "depends", biasExplanation: "Hot PPI → inflation concerns → USDINR UP. Cool PPI → USDINR DOWN." },
    { date: "2026-02-19", time: "08:30", event: "US Initial Jobless Claims", category: "us_data", impact: 3, whyItMatters: "Weekly labor market health check.", typicalBias: "depends", biasExplanation: "Low claims → USD strong. High claims → USD weak." },
    { date: "2026-02-19", time: "10:30", event: "EIA Crude Oil Inventory", category: "oil", impact: 3, whyItMatters: "India imports 85% of oil. Oil price swings directly impact INR.", typicalBias: "depends", biasExplanation: "Inventory draw → oil up → USDINR UP (INR weak). Build → USDINR DOWN." },
    { date: "2026-02-26", time: "08:30", event: "US Initial Jobless Claims", category: "us_data", impact: 3, whyItMatters: "Weekly labor market data.", typicalBias: "depends", biasExplanation: "Low claims → USD strong. High claims → USD weak." },
    { date: "2026-02-26", time: "08:30", event: "US GDP Q4 (2nd Est)", category: "us_data", impact: 4, whyItMatters: "Second estimate of Q4 growth. Revisions can move markets.", typicalBias: "depends", biasExplanation: "Upward revision → USD strong → USDINR UP. Downward → USDINR DOWN." },
    { date: "2026-02-27", time: "08:30", event: "US PCE Price Index (Jan)", category: "us_data", impact: 5, whyItMatters: "Fed's PREFERRED inflation gauge. More important than CPI for policy.", typicalBias: "depends", biasExplanation: "Hot PCE → Hawkish Fed → USDINR UP. Cool PCE → USDINR DOWN.", tradingTip: "Core PCE is what the Fed targets. Watch for deviation from 2%." },

    // MARCH 2026
    { date: "2026-03-06", time: "08:30", event: "US Non-Farm Payrolls (Feb)", category: "us_data", impact: 5, whyItMatters: "THE biggest market mover. Jobs = economic health = Fed policy.", typicalBias: "depends", biasExplanation: "Strong NFP (>200K) + low unemployment → USDINR UP. Weak (<100K) → USDINR DOWN.", tradingTip: "First Friday of month. Expect 40-60 paisa range on surprise." },
    { date: "2026-03-06", time: "08:30", event: "US Unemployment Rate (Feb)", category: "us_data", impact: 4, whyItMatters: "Fed's dual mandate metric. Rising unemployment triggers policy shift.", typicalBias: "depends", biasExplanation: "Low unemployment (<4%) → USDINR UP. Rising → USDINR DOWN." },
    { date: "2026-03-11", time: "08:30", event: "US CPI (Feb)", category: "us_data", impact: 5, whyItMatters: "February inflation. Critical for March FOMC decision.", typicalBias: "depends", biasExplanation: "Hot CPI → USDINR UP. Cool CPI → USDINR DOWN." },
    { date: "2026-03-17", time: "14:00", event: "FOMC Rate Decision", category: "fed", impact: 5, whyItMatters: "Fed sets interest rates. Dot plot shows future rate path expectations.", typicalBias: "depends", biasExplanation: "Hawkish hold/hike → USDINR UP. Dovish cut → USDINR DOWN.", tradingTip: "Watch the dot plot projections more than the actual rate decision." },
    { date: "2026-03-17", time: "14:30", event: "Fed Chair Powell Press Conference", category: "fed", impact: 5, whyItMatters: "Powell's tone shapes market expectations for months.", typicalBias: "depends", biasExplanation: "Hawkish tone → USDINR UP. Dovish signals → USDINR DOWN." },
    { date: "2026-03-27", time: "08:30", event: "US PCE Price Index (Feb)", category: "us_data", impact: 5, whyItMatters: "Fed's preferred inflation metric for February.", typicalBias: "depends", biasExplanation: "Hot PCE → USDINR UP. Cool PCE → USDINR DOWN." },

    // APRIL 2026
    { date: "2026-04-03", time: "08:30", event: "US Non-Farm Payrolls (Mar)", category: "us_data", impact: 5, whyItMatters: "March jobs report. Q1 employment picture.", typicalBias: "depends", biasExplanation: "Strong NFP → USDINR UP. Weak NFP → USDINR DOWN." },
    { date: "2026-04-08", time: "10:00", event: "RBI MPC Rate Decision", category: "rbi", impact: 5, whyItMatters: "RBI sets INR interest rates. Policy stance drives INR direction.", typicalBias: "depends", biasExplanation: "Rate cut → USDINR UP. Rate hike → USDINR DOWN. Hawkish hold → INR supported.", tradingTip: "Watch RBI's FX intervention stance in policy statement." },
    { date: "2026-04-10", time: "08:30", event: "US CPI (Mar)", category: "us_data", impact: 5, whyItMatters: "Q1 inflation picture emerges.", typicalBias: "depends", biasExplanation: "Hot CPI → USDINR UP. Cool CPI → USDINR DOWN." },
    { date: "2026-04-29", time: "08:30", event: "US GDP Q1 (Advance)", category: "us_data", impact: 5, whyItMatters: "First read on Q1 growth. Sets narrative for H1.", typicalBias: "depends", biasExplanation: "Strong GDP (>2%) → USDINR UP. Weak/negative → USDINR DOWN." },

    // MAY 2026
    { date: "2026-05-01", time: "08:30", event: "US Non-Farm Payrolls (Apr)", category: "us_data", impact: 5, whyItMatters: "April jobs data ahead of May FOMC.", typicalBias: "depends", biasExplanation: "Strong NFP → USDINR UP. Weak NFP → USDINR DOWN." },
    { date: "2026-05-05", time: "14:00", event: "FOMC Rate Decision", category: "fed", impact: 5, whyItMatters: "May FOMC meeting. Key policy decision.", typicalBias: "depends", biasExplanation: "Hawkish → USDINR UP. Dovish → USDINR DOWN." },
    { date: "2026-05-12", time: "08:30", event: "US CPI (Apr)", category: "us_data", impact: 5, whyItMatters: "April inflation reading.", typicalBias: "depends", biasExplanation: "Hot CPI → USDINR UP. Cool CPI → USDINR DOWN." },

    // JUNE 2026
    { date: "2026-06-05", time: "08:30", event: "US Non-Farm Payrolls (May)", category: "us_data", impact: 5, whyItMatters: "May employment data.", typicalBias: "depends", biasExplanation: "Strong NFP → USDINR UP. Weak NFP → USDINR DOWN." },
    { date: "2026-06-10", time: "08:30", event: "US CPI (May)", category: "us_data", impact: 5, whyItMatters: "May inflation ahead of June FOMC.", typicalBias: "depends", biasExplanation: "Hot CPI → USDINR UP. Cool CPI → USDINR DOWN." },
    { date: "2026-06-16", time: "14:00", event: "FOMC Rate Decision + SEP", category: "fed", impact: 5, whyItMatters: "June FOMC with updated economic projections.", typicalBias: "depends", biasExplanation: "Hawkish → USDINR UP. Dovish → USDINR DOWN.", tradingTip: "SEP (Summary of Economic Projections) updates rate path forecasts." },
    { date: "2026-06-17", time: "10:00", event: "RBI MPC Rate Decision", category: "rbi", impact: 5, whyItMatters: "Mid-year RBI policy review.", typicalBias: "depends", biasExplanation: "Rate cut → USDINR UP. Rate hike/hawkish hold → USDINR DOWN." },
  ];
}

// Helper functions
function getDaysFromNow(eventDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(eventDate + "T00:00:00");
  return Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function formatDisplayTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period} ET`;
}

export async function GET() {
  // Fetch market signals and spot in parallel
  const [marketSignals, spot] = await Promise.all([
    fetchMarketSignals(),
    fetchSpotFromSheet(),
  ]);

  // Process calendar
  const calendarRaw = get2026Calendar();
  const events = calendarRaw
    .map((e, idx) => ({
      ...e,
      id: `event-${e.date}-${idx}`,
      daysFromNow: getDaysFromNow(e.date),
      dateDisplay: formatDisplayDate(e.date),
      timeDisplay: formatDisplayTime(e.time),
    }))
    .filter(e => e.daysFromNow >= 0 && e.daysFromNow <= 30)
    .sort((a, b) => a.daysFromNow - b.daysFromNow || b.impact - a.impact);

  // Forward curve predictions
  let predictions = null;
  if (spot && spot > 0) {
    const fwd1m = forwardRate(spot, 1);
    const fwd3m = forwardRate(spot, 3);
    const fwd1mPoints = fwd1m - spot;
    const dailyDrift = fwd1mPoints / 30;
    const bias = fwd1mPoints > 0.05 ? "usdinr_up" : fwd1mPoints < -0.05 ? "usdinr_down" : "neutral";

    predictions = {
      currentSpot: Number(spot.toFixed(4)),
      forward1m: Number(fwd1m.toFixed(4)),
      forward3m: Number(fwd3m.toFixed(4)),
      predictions: {
        "1_day": { level: Number((spot + dailyDrift).toFixed(4)), change: Number(dailyDrift.toFixed(4)), changePct: Number((dailyDrift / spot * 100).toFixed(3)) },
        "3_day": { level: Number((spot + dailyDrift * 3).toFixed(4)), change: Number((dailyDrift * 3).toFixed(4)), changePct: Number((dailyDrift * 3 / spot * 100).toFixed(3)) },
        "1_week": { level: Number((spot + dailyDrift * 7).toFixed(4)), change: Number((dailyDrift * 7).toFixed(4)), changePct: Number((dailyDrift * 7 / spot * 100).toFixed(3)) },
        "1_month": { level: Number(fwd1m.toFixed(4)), change: Number(fwd1mPoints.toFixed(4)), changePct: Number((fwd1mPoints / spot * 100).toFixed(3)) },
      },
      forwardPoints: { "1m": Number(fwd1mPoints.toFixed(4)), "3m": Number((fwd3m - spot).toFixed(4)) },
      marketBias: bias,
      biasExplanation: bias === "usdinr_up"
        ? "Forward curve shows positive carry - INR expected to depreciate"
        : bias === "usdinr_down"
        ? "Forward curve shows negative carry - INR expected to appreciate"
        : "Forward curve flat - no strong signal",
      note: "Based on interest rate differential (INR ~6.5% vs USD ~4.5%). Spot is live from your data.",
    };
  }

  // Compute combined signal from market data
  let combinedSignal = null;
  if (marketSignals.length > 0) {
    const bullishCount = marketSignals.filter(s => s.usdinrBias === "up").length;
    const bearishCount = marketSignals.filter(s => s.usdinrBias === "down").length;
    const total = marketSignals.length;

    let direction: "bullish" | "bearish" | "mixed" = "mixed";
    let strength = 0;

    if (bullishCount >= 3) {
      direction = "bullish";
      strength = bullishCount / total;
    } else if (bearishCount >= 3) {
      direction = "bearish";
      strength = bearishCount / total;
    } else {
      strength = Math.max(bullishCount, bearishCount) / total;
    }

    combinedSignal = {
      direction,
      bullishCount,
      bearishCount,
      neutralCount: total - bullishCount - bearishCount,
      total,
      strength: Number((strength * 100).toFixed(0)),
      summary: direction === "bullish"
        ? `${bullishCount}/${total} signals point USDINR higher`
        : direction === "bearish"
        ? `${bearishCount}/${total} signals point USDINR lower`
        : `Mixed signals - no clear direction`,
    };
  }

  return NextResponse.json({
    events,
    predictions,
    marketSignals,
    combinedSignal,
    generatedAt: new Date().toISOString(),
    dataSource: "Curated Calendar + Live Market Data (Yahoo Finance)",
    totalEvents: events.length,
  });
}
