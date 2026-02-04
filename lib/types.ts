// ─── Core data types for the HectarFX platform ───

export type Trade = {
  tradeId: string;
  commodity: string;
  usdInvoice: number;       // USD purchase invoice amount (exposure)
  inrSale: number;           // INR sale proceeds
  inrSaleDate: string;       // YYYY-MM-DD expected receipt
  mtbFx: number;             // marked-to-book USDINR rate
  mtmFx?: number;            // marked-to-market USDINR rate (current)
  notes?: string;
};

export type FxBoard = {
  spot: number;
  fwd1m: number;
  fwd2m: number;
  fwd3m: number;
  fwd6m?: number;
  fwd12m?: number;
  updatedAt?: string;
};

export type HedgeLeg = {
  id: string;
  date: string;              // execution date YYYY-MM-DD
  settlementDate: string;    // settlement date YYYY-MM-DD
  notionalUsd: number;
  type: "FWD_SELL_USD" | "FWD_BUY_USD" | "OPTION_PUT_USD" | "OPTION_CALL_USD";
  rate: number;
  premium?: number;          // for options
  status: "ACTIVE" | "SETTLED" | "CANCELLED";
};

export type StrategyType =
  | "FULL_HEDGE_NOW"
  | "LAYERED_FORWARDS"
  | "DYNAMIC_BANDS"
  | "RANGE_FORWARD"
  | "NO_HEDGE";

export type StrategyLayer = {
  pct: number;             // fraction of exposure e.g. 0.50
  triggerSpot: number;     // spot level that triggers this layer
  action: "HEDGE_SELL_USD";
};

export type Strategy = {
  name: StrategyType;
  label: string;
  description: string;
  layers?: StrategyLayer[];
  tenorDays?: number;
  bandWidth?: number;       // for dynamic bands strategy
  lowerStrike?: number;     // for range forward
  upperStrike?: number;     // for range forward
};

export type ScenarioPoint = {
  date: string;
  spot: number;
};

export type Scenario = {
  name: string;
  path: ScenarioPoint[];
};

export type SimulationRequest = {
  fx: FxBoard;
  trades: Trade[];
  strategy: Strategy;
  scenarios: Scenario[];
};

export type SimulationResult = {
  scenario: string;
  finalSpot: number;
  exposureUsd: number;
  mtbBlended: number;
  hedgeLegs: HedgeLeg[];
  hedgedPct: number;
  hedgePnlInr: number;
  hedgePnlUsd: number;
  unhedgedImpactInr: number;
  netPnlInr: number;
  netPnlUsd: number;
  effectiveRate: number;
};

export type AlertRule = {
  id: string;
  type: "SPOT_ABOVE" | "SPOT_BELOW" | "FORWARD_ABOVE" | "FORWARD_BELOW";
  level: number;
  message: string;
  enabled: boolean;
  channel: "EMAIL" | "WHATSAPP" | "BOTH";
  lastTriggered?: string;
};

export type PositionSummary = {
  totalUsdExposure: number;
  totalInrExpected: number;
  blendedMtbRate: number;
  currentSpot: number;
  mtmPnlInr: number;
  mtmPnlUsd: number;
  hedgedUsd: number;
  hedgedPct: number;
  openExposureUsd: number;
  weightedDaysToMaturity: number;
};

export type StrategySuggestion = {
  strategy: StrategyType;
  label: string;
  rationale: string;
  expectedSavingInr: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;        // 0–1
};
