// ─── Simulation engine ───

import {
  Trade,
  FxBoard,
  HedgeLeg,
  Strategy,
  Scenario,
  SimulationRequest,
  SimulationResult,
} from "./types";
import { addDays, daysBetween, forwardRate } from "./fx";

let hedgeIdCounter = 0;

function nextHedgeId(): string {
  return `H${++hedgeIdCounter}`;
}

function totalUsdExposure(trades: Trade[]): number {
  return trades.reduce((sum, t) => sum + t.usdInvoice, 0);
}

function blendedMtbRate(trades: Trade[]): number {
  const totalUsd = totalUsdExposure(trades);
  if (totalUsd === 0) return 0;
  return trades.reduce((sum, t) => sum + t.mtbFx * t.usdInvoice, 0) / totalUsd;
}

function latestSettlement(trades: Trade[]): string {
  const dates = trades.map((t) => t.inrSaleDate).filter(Boolean).sort();
  return dates[dates.length - 1] || addDays(new Date().toISOString().slice(0, 10), 90);
}

function executeLayeredForwards(
  trades: Trade[],
  strategy: Strategy,
  scenario: Scenario,
  fx: FxBoard
): HedgeLeg[] {
  const exposure = totalUsdExposure(trades);
  const layers = strategy.layers || [];
  const settlement = latestSettlement(trades);
  const hedgeLegs: HedgeLeg[] = [];
  const executed = new Set<number>();

  for (const point of scenario.path) {
    layers.forEach((layer, idx) => {
      if (executed.has(idx)) return;
      if (point.spot >= layer.triggerSpot) {
        executed.add(idx);
        const tenorMonths = Math.max(1, Math.round(daysBetween(point.date, settlement) / 30));
        const fwdRate = forwardRate(point.spot, tenorMonths);
        hedgeLegs.push({
          id: nextHedgeId(),
          date: point.date,
          settlementDate: settlement,
          notionalUsd: Math.round(exposure * layer.pct),
          type: "FWD_SELL_USD",
          rate: fwdRate,
          status: "ACTIVE",
        });
      }
    });
  }

  return hedgeLegs;
}

function executeFullHedge(
  trades: Trade[],
  strategy: Strategy,
  scenario: Scenario,
  fx: FxBoard
): HedgeLeg[] {
  const exposure = totalUsdExposure(trades);
  const settlement = latestSettlement(trades);
  const today = scenario.path[0]?.date || new Date().toISOString().slice(0, 10);
  const tenorMonths = Math.max(1, Math.round(daysBetween(today, settlement) / 30));
  const fwdRate = forwardRate(fx.spot, tenorMonths);

  return [
    {
      id: nextHedgeId(),
      date: today,
      settlementDate: settlement,
      notionalUsd: exposure,
      type: "FWD_SELL_USD",
      rate: fwdRate,
      status: "ACTIVE",
    },
  ];
}

function executeDynamicBands(
  trades: Trade[],
  strategy: Strategy,
  scenario: Scenario,
  fx: FxBoard
): HedgeLeg[] {
  const exposure = totalUsdExposure(trades);
  const settlement = latestSettlement(trades);
  const bandWidth = strategy.bandWidth || 0.50;
  const hedgeLegs: HedgeLeg[] = [];
  let hedgedPct = 0;

  const baseSpot = fx.spot;
  const upperBand = baseSpot + bandWidth;
  const lowerBand = baseSpot - bandWidth;

  for (const point of scenario.path) {
    if (hedgedPct >= 1.0) break;

    // Hedge more as spot moves up (favorable for USD seller)
    if (point.spot >= upperBand && hedgedPct < 0.5) {
      const pct = 0.25;
      hedgedPct += pct;
      const tenorMonths = Math.max(1, Math.round(daysBetween(point.date, settlement) / 30));
      hedgeLegs.push({
        id: nextHedgeId(),
        date: point.date,
        settlementDate: settlement,
        notionalUsd: Math.round(exposure * pct),
        type: "FWD_SELL_USD",
        rate: forwardRate(point.spot, tenorMonths),
        status: "ACTIVE",
      });
    }

    if (point.spot >= upperBand + bandWidth && hedgedPct < 0.75) {
      const pct = 0.25;
      hedgedPct += pct;
      const tenorMonths = Math.max(1, Math.round(daysBetween(point.date, settlement) / 30));
      hedgeLegs.push({
        id: nextHedgeId(),
        date: point.date,
        settlementDate: settlement,
        notionalUsd: Math.round(exposure * pct),
        type: "FWD_SELL_USD",
        rate: forwardRate(point.spot, tenorMonths),
        status: "ACTIVE",
      });
    }
  }

  return hedgeLegs;
}

function executeRangeForward(
  trades: Trade[],
  strategy: Strategy,
  scenario: Scenario,
  fx: FxBoard
): HedgeLeg[] {
  const exposure = totalUsdExposure(trades);
  const settlement = latestSettlement(trades);
  const today = scenario.path[0]?.date || new Date().toISOString().slice(0, 10);
  const lower = strategy.lowerStrike || fx.spot - 0.75;
  const upper = strategy.upperStrike || fx.spot + 0.75;

  // Range forward = sell USD call (cap upside) + buy USD put (floor downside)
  return [
    {
      id: nextHedgeId(),
      date: today,
      settlementDate: settlement,
      notionalUsd: exposure,
      type: "FWD_SELL_USD",
      rate: upper, // locked sell rate (cap)
      status: "ACTIVE",
    },
    {
      id: nextHedgeId(),
      date: today,
      settlementDate: settlement,
      notionalUsd: exposure,
      type: "FWD_BUY_USD",
      rate: lower, // floor
      status: "ACTIVE",
    },
  ];
}

function computeHedgePnl(hedgeLegs: HedgeLeg[], finalSpot: number): { pnlInr: number; pnlUsd: number } {
  let pnlInr = 0;

  for (const leg of hedgeLegs) {
    if (leg.type === "FWD_SELL_USD") {
      // You locked selling USD at leg.rate; spot ended at finalSpot
      // If you locked higher, you gained INR per USD sold
      pnlInr += (leg.rate - finalSpot) * leg.notionalUsd;
    } else if (leg.type === "FWD_BUY_USD") {
      // Range forward floor: only exercise if spot < floor
      if (finalSpot < leg.rate) {
        // You're forced to buy USD at floor rate instead of cheaper spot
        pnlInr -= (leg.rate - finalSpot) * leg.notionalUsd;
      }
    }
  }

  const pnlUsd = finalSpot > 0 ? pnlInr / finalSpot : 0;
  return { pnlInr, pnlUsd };
}

export function runSimulation(req: SimulationRequest): SimulationResult[] {
  hedgeIdCounter = 0;
  const exposure = totalUsdExposure(req.trades);
  const mtb = blendedMtbRate(req.trades);

  return req.scenarios.map((scenario) => {
    let hedgeLegs: HedgeLeg[];

    switch (req.strategy.name) {
      case "FULL_HEDGE_NOW":
        hedgeLegs = executeFullHedge(req.trades, req.strategy, scenario, req.fx);
        break;
      case "LAYERED_FORWARDS":
        hedgeLegs = executeLayeredForwards(req.trades, req.strategy, scenario, req.fx);
        break;
      case "DYNAMIC_BANDS":
        hedgeLegs = executeDynamicBands(req.trades, req.strategy, scenario, req.fx);
        break;
      case "RANGE_FORWARD":
        hedgeLegs = executeRangeForward(req.trades, req.strategy, scenario, req.fx);
        break;
      case "NO_HEDGE":
      default:
        hedgeLegs = [];
        break;
    }

    const finalSpot = scenario.path[scenario.path.length - 1]?.spot || req.fx.spot;
    const { pnlInr: hedgePnlInr, pnlUsd: hedgePnlUsd } = computeHedgePnl(hedgeLegs, finalSpot);

    const hedgedUsd = hedgeLegs
      .filter((l) => l.type === "FWD_SELL_USD")
      .reduce((s, l) => s + l.notionalUsd, 0);
    const hedgedPct = exposure > 0 ? hedgedUsd / exposure : 0;

    // Unhedged impact vs MTB
    const unhedgedUsd = exposure - hedgedUsd;
    const unhedgedImpactInr = (mtb - finalSpot) * unhedgedUsd;

    const netPnlInr = hedgePnlInr + unhedgedImpactInr;
    const netPnlUsd = finalSpot > 0 ? netPnlInr / finalSpot : 0;

    // Effective blended rate achieved
    const hedgedInr = hedgeLegs
      .filter((l) => l.type === "FWD_SELL_USD")
      .reduce((s, l) => s + l.rate * l.notionalUsd, 0);
    const unhedgedInr = unhedgedUsd * finalSpot;
    const effectiveRate = exposure > 0 ? (hedgedInr + unhedgedInr) / exposure : finalSpot;

    return {
      scenario: scenario.name,
      finalSpot,
      exposureUsd: exposure,
      mtbBlended: Math.round(mtb * 10000) / 10000,
      hedgeLegs,
      hedgedPct: Math.round(hedgedPct * 10000) / 10000,
      hedgePnlInr: Math.round(hedgePnlInr),
      hedgePnlUsd: Math.round(hedgePnlUsd),
      unhedgedImpactInr: Math.round(unhedgedImpactInr),
      netPnlInr: Math.round(netPnlInr),
      netPnlUsd: Math.round(netPnlUsd),
      effectiveRate: Math.round(effectiveRate * 10000) / 10000,
    };
  });
}
