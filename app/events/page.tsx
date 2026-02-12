"use client";

import { useEffect, useState } from "react";

type MarketEvent = {
  id: string;
  date: string;
  time: string;
  event: string;
  category: "fed" | "us_data" | "rbi" | "india_data" | "oil";
  impact: 1 | 2 | 3 | 4 | 5;
  whyItMatters: string;
  typicalBias: "usdinr_up" | "usdinr_down" | "volatile" | "depends";
  biasExplanation: string;
  tradingTip?: string;
  daysFromNow: number;
  dateDisplay: string;
  timeDisplay: string;
};

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

type CombinedSignal = {
  direction: "bullish" | "bearish" | "mixed";
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  total: number;
  strength: number;
  summary: string;
};

type Prediction = {
  level: number;
  change: number;
  changePct: number;
};

type Predictions = {
  currentSpot: number;
  forward1m: number;
  forward3m: number;
  predictions: {
    "1_day": Prediction;
    "3_day": Prediction;
    "1_week": Prediction;
    "1_month": Prediction;
  };
  forwardPoints: { "1m": number; "3m": number };
  marketBias: string;
  biasExplanation: string;
  note: string;
};

export default function EventWatchPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [marketSignals, setMarketSignals] = useState<MarketSignal[]>([]);
  const [combinedSignal, setCombinedSignal] = useState<CombinedSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events || []);
        setPredictions(data.predictions || null);
        setMarketSignals(data.marketSignals || []);
        setCombinedSignal(data.combinedSignal || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getImpactStars = (impact: number) => "★".repeat(impact) + "☆".repeat(5 - impact);
  const getImpactColor = (impact: number) => impact >= 5 ? "#ef4444" : impact >= 4 ? "#f59e0b" : impact >= 3 ? "#3b82f6" : "#6b7280";

  const getCategoryStyle = (category: string) => {
    const styles: Record<string, { label: string; color: string; bg: string }> = {
      fed: { label: "FED", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },
      us_data: { label: "US", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" },
      rbi: { label: "RBI", color: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },
      india_data: { label: "IN", color: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },
      oil: { label: "OIL", color: "#84cc16", bg: "rgba(132, 204, 22, 0.15)" },
    };
    return styles[category] || { label: category.toUpperCase(), color: "#6b7280", bg: "rgba(128,128,128,0.15)" };
  };

  const getBiasStyle = (bias: string) => {
    switch (bias) {
      case "usdinr_up": return { icon: "↑", color: "#ef4444" };
      case "usdinr_down": return { icon: "↓", color: "#22c55e" };
      case "volatile": return { icon: "↔", color: "#f59e0b" };
      default: return { icon: "?", color: "#3b82f6" };
    }
  };

  const getDaysStyle = (days: number) => {
    if (days === 0) return { text: "TODAY", color: "#ef4444", bg: "rgba(239, 68, 68, 0.2)" };
    if (days === 1) return { text: "TOMORROW", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.2)" };
    if (days <= 3) return { text: `${days}d`, color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" };
    if (days <= 7) return { text: `${days}d`, color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" };
    return { text: `${days}d`, color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" };
  };

  const thisWeek = events.filter((e) => e.daysFromNow <= 7);
  const nextWeeks = events.filter((e) => e.daysFromNow > 7);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Event Watch</h1>
        <div className="card p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-700/50 rounded w-1/3"></div>
            <div className="h-32 bg-gray-700/30 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Event Watch</h1>
          <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: "rgba(139, 92, 246, 0.2)", color: "#a78bfa" }}>
            USDINR
          </span>
        </div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {events.length} events • Next 30 days
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MARKET SIGNALS - Live directional indicators */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {marketSignals.length > 0 && (
        <div className="card p-5" style={{ border: "2px solid #8b5cf6" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Direction Signals</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(34, 197, 94, 0.2)", color: "#22c55e" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                LIVE
              </span>
            </div>
            {combinedSignal && (
              <div className="text-xs font-medium" style={{
                color: combinedSignal.direction === "bullish" ? "#ef4444"
                  : combinedSignal.direction === "bearish" ? "#22c55e" : "#f59e0b"
              }}>
                {combinedSignal.summary}
              </div>
            )}
          </div>

          {/* Combined Signal Bar */}
          {combinedSignal && (
            <div className="mb-4 p-3 rounded-lg" style={{
              background: combinedSignal.direction === "bullish" ? "rgba(239, 68, 68, 0.1)"
                : combinedSignal.direction === "bearish" ? "rgba(34, 197, 94, 0.1)" : "rgba(245, 158, 11, 0.1)",
              border: `1px solid ${combinedSignal.direction === "bullish" ? "rgba(239, 68, 68, 0.3)"
                : combinedSignal.direction === "bearish" ? "rgba(34, 197, 94, 0.3)" : "rgba(245, 158, 11, 0.3)"}`
            }}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {combinedSignal.direction === "bullish" ? "↑" : combinedSignal.direction === "bearish" ? "↓" : "↔"}
                </span>
                <div>
                  <div className="font-bold" style={{
                    color: combinedSignal.direction === "bullish" ? "#ef4444"
                      : combinedSignal.direction === "bearish" ? "#22c55e" : "#f59e0b"
                  }}>
                    {combinedSignal.direction === "bullish" ? "USDINR Bullish"
                      : combinedSignal.direction === "bearish" ? "USDINR Bearish" : "Mixed Signals"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {combinedSignal.bullishCount} bullish • {combinedSignal.bearishCount} bearish • {combinedSignal.neutralCount} neutral
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Individual Signals Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {marketSignals.map((signal) => (
              <div key={signal.symbol} className="p-3 rounded-lg" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>{signal.symbol}</span>
                  <span className="text-sm font-bold" style={{
                    color: signal.usdinrBias === "up" ? "#ef4444" : signal.usdinrBias === "down" ? "#22c55e" : "#6b7280"
                  }}>
                    {signal.usdinrBias === "up" ? "↑" : signal.usdinrBias === "down" ? "↓" : "→"}
                  </span>
                </div>
                <div className="text-lg font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>
                  {signal.symbol === "US10Y" ? `${signal.value}%` : signal.symbol === "BRENT" ? `$${signal.value}` : signal.value}
                </div>
                <div className="text-xs" style={{ color: signal.changePct >= 0 ? "#ef4444" : "#22c55e" }}>
                  {signal.changePct >= 0 ? "+" : ""}{signal.changePct.toFixed(2)}%
                </div>
                <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{signal.reasoning}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
            DXY↑ = USD strong globally • BRENT↑ = INR pressure (import bill) • US10Y↑ = USD yield attractive • VIX↑ = Risk-off, EM weak
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FORWARD CURVE OUTLOOK */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {predictions && (
        <div className="card p-5" style={{ border: "2px solid #06b6d4" }}>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Forward Curve Outlook</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(6, 182, 212, 0.2)", color: "#06b6d4" }}>
              CARRY TRADE IMPLIED
            </span>
          </div>

          {/* Spot */}
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-3xl font-bold" style={{ color: "#06b6d4" }}>{predictions.currentSpot.toFixed(4)}</span>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Spot (live)</span>
          </div>

          {/* Predictions Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "1 Day", data: predictions.predictions["1_day"] },
              { label: "3 Days", data: predictions.predictions["3_day"] },
              { label: "1 Week", data: predictions.predictions["1_week"] },
              { label: "1 Month", data: predictions.predictions["1_month"] },
            ].map(({ label, data }) => (
              <div key={label} className="p-3 rounded-lg" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}>
                <div className="text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
                <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{data.level.toFixed(4)}</div>
                <div className="text-xs" style={{ color: data.change >= 0 ? "#ef4444" : "#22c55e" }}>
                  {data.change >= 0 ? "+" : ""}{data.change.toFixed(4)}
                </div>
              </div>
            ))}
          </div>

          {/* Bias */}
          <div className="p-3 rounded-lg mb-3" style={{
            background: predictions.marketBias === "usdinr_up" ? "rgba(239, 68, 68, 0.1)" : predictions.marketBias === "usdinr_down" ? "rgba(34, 197, 94, 0.1)" : "rgba(59, 130, 246, 0.1)",
            border: `1px solid ${predictions.marketBias === "usdinr_up" ? "rgba(239, 68, 68, 0.3)" : predictions.marketBias === "usdinr_down" ? "rgba(34, 197, 94, 0.3)" : "rgba(59, 130, 246, 0.3)"}`
          }}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{predictions.marketBias === "usdinr_up" ? "↑" : predictions.marketBias === "usdinr_down" ? "↓" : "→"}</span>
              <div>
                <div className="font-semibold" style={{ color: predictions.marketBias === "usdinr_up" ? "#ef4444" : predictions.marketBias === "usdinr_down" ? "#22c55e" : "#3b82f6" }}>
                  {predictions.biasExplanation}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  1M Points: {predictions.forwardPoints["1m"] >= 0 ? "+" : ""}{predictions.forwardPoints["1m"].toFixed(4)} •
                  3M Points: {predictions.forwardPoints["3m"] >= 0 ? "+" : ""}{predictions.forwardPoints["3m"].toFixed(4)}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {predictions.note}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* THIS WEEK'S EVENTS */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {thisWeek.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            This Week
            <span className="text-xs font-normal ml-2" style={{ color: "var(--text-muted)" }}>{thisWeek.length} event{thisWeek.length !== 1 ? "s" : ""}</span>
          </h2>

          <div className="space-y-2">
            {thisWeek.map((event) => {
              const cat = getCategoryStyle(event.category);
              const bias = getBiasStyle(event.typicalBias);
              const days = getDaysStyle(event.daysFromNow);
              const isExpanded = expandedEvent === event.id;

              return (
                <div
                  key={event.id}
                  className="rounded-lg overflow-hidden transition-all cursor-pointer hover:border-blue-500/50"
                  style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}
                  onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                >
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: days.bg, color: days.color }}>{days.text}</span>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{event.dateDisplay} • {event.timeDisplay}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                          <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{event.event}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[9px] mb-0.5" style={{ color: "var(--text-muted)" }}>IMPACT</div>
                          <div className="text-[10px]" style={{ color: getImpactColor(event.impact) }}>{getImpactStars(event.impact)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] mb-0.5" style={{ color: "var(--text-muted)" }}>BIAS</div>
                          <div className="text-sm font-bold" style={{ color: bias.color }}>{bias.icon}</div>
                        </div>
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] font-bold mb-1" style={{ color: "#3b82f6" }}>WHY IT MATTERS</div>
                          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{event.whyItMatters}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold mb-1" style={{ color: "#f59e0b" }}>EXPECTED MOVE</div>
                          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{event.biasExplanation}</div>
                        </div>
                      </div>
                      {event.tradingTip && (
                        <div className="mt-3 p-2 rounded-lg" style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                          <div className="text-[10px] font-bold mb-1" style={{ color: "#22c55e" }}>TRADING TIP</div>
                          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{event.tradingTip}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* COMING UP */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {nextWeeks.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Coming Up
            <span className="text-xs font-normal ml-2" style={{ color: "var(--text-muted)" }}>{nextWeeks.length} event{nextWeeks.length !== 1 ? "s" : ""}</span>
          </h2>

          <div className="space-y-2">
            {nextWeeks.map((event) => {
              const cat = getCategoryStyle(event.category);
              const bias = getBiasStyle(event.typicalBias);
              const days = getDaysStyle(event.daysFromNow);

              return (
                <div key={event.id} className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: days.bg, color: days.color }}>{days.text}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                    <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{event.event}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] hidden sm:block" style={{ color: getImpactColor(event.impact) }}>{getImpactStars(event.impact)}</span>
                    <span className="text-sm font-bold" style={{ color: bias.color }}>{bias.icon}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-lg mb-2" style={{ color: "var(--text-primary)" }}>No upcoming events</div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>Check back later for USDINR-moving events</div>
        </div>
      )}

      {/* Legend */}
      <div className="card p-4">
        <div className="text-xs font-bold mb-3" style={{ color: "var(--text-primary)" }}>Quick Reference</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Impact</div>
            <div style={{ color: "#ef4444" }}>★★★★★ Market mover</div>
            <div style={{ color: "#f59e0b" }}>★★★★☆ High impact</div>
            <div style={{ color: "#3b82f6" }}>★★★☆☆ Moderate</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Direction</div>
            <div style={{ color: "#ef4444" }}>↑ USDINR likely UP</div>
            <div style={{ color: "#22c55e" }}>↓ USDINR likely DOWN</div>
            <div style={{ color: "#3b82f6" }}>? Data dependent</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Key Signals</div>
            <div>DXY = Global USD strength</div>
            <div>Brent = Oil import cost</div>
            <div>US10Y = Yield differential</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Key Events</div>
            <div>NFP = 1st Friday</div>
            <div>CPI = ~10th-12th</div>
            <div>FOMC = 8x/year</div>
          </div>
        </div>
      </div>
    </div>
  );
}
