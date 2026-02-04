// ─── Strategy suggestion engine ───

import { Trade, FxBoard, StrategySuggestion, PositionSummary } from "./types";
import { daysBetween } from "./fx";

export function computePositionSummary(trades: Trade[], spot: number): PositionSummary {
  const totalUsd = trades.reduce((s, t) => s + t.usdInvoice, 0);
  const totalInr = trades.reduce((s, t) => s + t.inrSale, 0);
  const blendedMtb = totalUsd > 0
    ? trades.reduce((s, t) => s + t.mtbFx * t.usdInvoice, 0) / totalUsd
    : 0;

  const mtmPnlInr = trades.reduce((s, t) => (t.mtbFx - spot) * t.usdInvoice + s, 0);
  const mtmPnlUsd = spot > 0 ? mtmPnlInr / spot : 0;

  const today = new Date().toISOString().slice(0, 10);
  const totalWeightedDays = trades.reduce((s, t) => {
    const days = t.inrSaleDate ? Math.max(0, daysBetween(today, t.inrSaleDate)) : 60;
    return s + days * t.usdInvoice;
  }, 0);
  const weightedDays = totalUsd > 0 ? totalWeightedDays / totalUsd : 60;

  return {
    totalUsdExposure: totalUsd,
    totalInrExpected: totalInr,
    blendedMtbRate: Math.round(blendedMtb * 10000) / 10000,
    currentSpot: spot,
    mtmPnlInr: Math.round(mtmPnlInr),
    mtmPnlUsd: Math.round(mtmPnlUsd),
    hedgedUsd: 0, // populated from actual hedge book
    hedgedPct: 0,
    openExposureUsd: totalUsd,
    weightedDaysToMaturity: Math.round(weightedDays),
  };
}

export function generateSuggestions(
  trades: Trade[],
  fx: FxBoard
): StrategySuggestion[] {
  const summary = computePositionSummary(trades, fx.spot);
  const suggestions: StrategySuggestion[] = [];

  const mtbVsSpot = summary.blendedMtbRate - fx.spot;
  const exposure = summary.totalUsdExposure;
  const daysToMaturity = summary.weightedDaysToMaturity;

  // 1. If MTB is significantly above spot → INR has strengthened, you're losing on conversion
  //    Suggest hedging immediately to lock current rates
  if (mtbVsSpot > 0.50) {
    suggestions.push({
      strategy: "FULL_HEDGE_NOW",
      label: "Full Hedge Now",
      rationale: `Your book rate (₹${summary.blendedMtbRate.toFixed(2)}) is ₹${mtbVsSpot.toFixed(2)} above spot (₹${fx.spot.toFixed(2)}). INR has strengthened since you booked these trades. Lock in current forward rates to prevent further MTM losses.`,
      expectedSavingInr: Math.round(mtbVsSpot * 0.3 * exposure), // conservative estimate
      riskLevel: "LOW",
      confidence: 0.85,
    });
  }

  // 2. Layered forwards - good for medium-term outlook
  if (daysToMaturity > 30 && exposure > 50000) {
    const triggerBase = fx.spot;
    suggestions.push({
      strategy: "LAYERED_FORWARDS",
      label: "Layered Forwards (50/30/20)",
      rationale: `With ${daysToMaturity} days avg to maturity and $${(exposure / 1000).toFixed(0)}K exposure, layer your hedges: 50% at ₹${(triggerBase + 0.15).toFixed(2)}, 30% at ₹${(triggerBase + 0.40).toFixed(2)}, 20% at ₹${(triggerBase + 0.65).toFixed(2)}. This captures favourable moves while managing downside.`,
      expectedSavingInr: Math.round(0.25 * exposure),
      riskLevel: "MEDIUM",
      confidence: 0.72,
    });
  }

  // 3. Dynamic bands - good when market is range-bound
  if (daysToMaturity > 45) {
    suggestions.push({
      strategy: "DYNAMIC_BANDS",
      label: "Dynamic Band Hedging",
      rationale: `Set bands around current spot ₹${fx.spot.toFixed(2)} (±₹0.50). Automatically increase hedge ratio as USDINR moves in your favour. Good for range-bound markets with ${daysToMaturity}-day horizon.`,
      expectedSavingInr: Math.round(0.15 * exposure),
      riskLevel: "MEDIUM",
      confidence: 0.65,
    });
  }

  // 4. Range forward - zero-cost collar
  if (exposure > 100000) {
    suggestions.push({
      strategy: "RANGE_FORWARD",
      label: "Range Forward (Zero-Cost Collar)",
      rationale: `Zero premium structure: floor at ₹${(fx.spot - 0.75).toFixed(2)}, cap at ₹${(fx.spot + 0.75).toFixed(2)}. You give up upside beyond the cap but get downside protection. Suitable for your $${(exposure / 1000).toFixed(0)}K position.`,
      expectedSavingInr: Math.round(0.10 * exposure),
      riskLevel: "LOW",
      confidence: 0.78,
    });
  }

  // 5. No hedge - if spot is well below MTB (market is in your favor)
  if (mtbVsSpot < -0.50) {
    suggestions.push({
      strategy: "NO_HEDGE",
      label: "Stay Unhedged (Monitor)",
      rationale: `Spot ₹${fx.spot.toFixed(2)} is ₹${Math.abs(mtbVsSpot).toFixed(2)} above your book rate. Market is moving in your favour. Consider staying unhedged for now but set alerts at ₹${(fx.spot - 0.50).toFixed(2)} to reassess.`,
      expectedSavingInr: Math.round(Math.abs(mtbVsSpot) * 0.5 * exposure),
      riskLevel: "HIGH",
      confidence: 0.55,
    });
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}
