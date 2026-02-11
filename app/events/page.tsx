"use client";

import { useEffect, useState } from "react";

type MarketEvent = {
  id: string;
  date: string;
  time?: string;
  event: string;
  category: "fed" | "us_data" | "rbi" | "india_data" | "global" | "oil" | "flows";
  impact: 1 | 2 | 3 | 4 | 5;
  whyItMatters: string;
  typicalBias: "usdinr_up" | "usdinr_down" | "volatile" | "depends";
  biasExplanation: string;
  actionableInsight?: string;
  daysFromNow: number;
};

type MarketContext = {
  keyDrivers: {
    driver: string;
    currentStance: string;
    impactOnUsdinr: string;
  }[];
  quickTake: string;
};

export default function EventWatchPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);
  const [methodology, setMethodology] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events || []);
        setMarketContext(data.marketContext || null);
        setMethodology(data.methodology || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getImpactStars = (impact: number) => {
    return "★".repeat(impact) + "☆".repeat(5 - impact);
  };

  const getImpactColor = (impact: number) => {
    if (impact >= 5) return "var(--accent-red)";
    if (impact >= 4) return "var(--accent-amber)";
    if (impact >= 3) return "var(--accent-blue)";
    return "var(--text-muted)";
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, { label: string; color: string; bg: string }> = {
      fed: { label: "FED", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },
      us_data: { label: "US DATA", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" },
      rbi: { label: "RBI", color: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },
      india_data: { label: "INDIA", color: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },
      global: { label: "GLOBAL", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)" },
      oil: { label: "OIL", color: "#84cc16", bg: "rgba(132, 204, 22, 0.15)" },
      flows: { label: "FLOWS", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)" },
    };
    return labels[category] || { label: category.toUpperCase(), color: "var(--text-muted)", bg: "rgba(128,128,128,0.15)" };
  };

  const getBiasIndicator = (bias: string) => {
    switch (bias) {
      case "usdinr_up":
        return { icon: "↑", color: "var(--accent-red)", text: "USDINR UP" };
      case "usdinr_down":
        return { icon: "↓", color: "var(--accent-green)", text: "USDINR DOWN" };
      case "volatile":
        return { icon: "↔", color: "var(--accent-amber)", text: "VOLATILE" };
      default:
        return { icon: "?", color: "var(--accent-blue)", text: "DEPENDS" };
    }
  };

  const getDaysLabel = (days: number) => {
    if (days === 0) return { text: "TODAY", color: "var(--accent-red)", urgent: true };
    if (days === 1) return { text: "TOMORROW", color: "var(--accent-amber)", urgent: true };
    if (days <= 3) return { text: `${days}d`, color: "var(--accent-amber)", urgent: true };
    if (days <= 7) return { text: `${days}d`, color: "var(--accent-blue)", urgent: false };
    return { text: `${days}d`, color: "var(--text-muted)", urgent: false };
  };

  // Separate high-impact (this week) vs coming up
  const thisWeek = events.filter((e) => e.daysFromNow <= 7);
  const comingUp = events.filter((e) => e.daysFromNow > 7);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Event Watch
          </h1>
        </div>
        <div className="card p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-700/50 rounded w-1/3"></div>
            <div className="h-32 bg-gray-700/30 rounded"></div>
            <div className="h-6 bg-gray-700/50 rounded w-1/4"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-gray-700/30 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Event Watch
          </h1>
          <span
            className="text-xs px-2 py-1 rounded font-medium"
            style={{ background: "var(--accent-purple)", color: "white" }}
          >
            USDINR Impact
          </span>
        </div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Next 21 days
        </div>
      </div>

      {/* Market Context Overview */}
      {marketContext && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Market Context
          </h2>

          {/* Quick Take */}
          <div
            className="p-4 rounded-lg mb-4"
            style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.2)" }}
          >
            <div className="text-xs font-medium mb-1" style={{ color: "var(--accent-blue)" }}>
              QUICK TAKE
            </div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {marketContext.quickTake}
            </div>
          </div>

          {/* Key Drivers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {marketContext.keyDrivers.map((driver, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg"
                style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}
              >
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  {driver.driver}
                </div>
                <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                  {driver.currentStance}
                </div>
                <div className="text-xs" style={{ color: "var(--accent-amber)" }}>
                  {driver.impactOnUsdinr}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* This Week - High Priority */}
      {thisWeek.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            This Week
            <span className="text-xs font-normal ml-2" style={{ color: "var(--text-muted)" }}>
              {thisWeek.length} event{thisWeek.length !== 1 ? "s" : ""}
            </span>
          </h2>

          <div className="space-y-3">
            {thisWeek.map((event) => {
              const category = getCategoryLabel(event.category);
              const bias = getBiasIndicator(event.typicalBias);
              const daysLabel = getDaysLabel(event.daysFromNow);
              const isExpanded = expandedEvent === event.id;

              return (
                <div
                  key={event.id}
                  className="rounded-lg overflow-hidden transition-all cursor-pointer"
                  style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}
                  onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                >
                  {/* Main Row */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Date & Event */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs font-bold px-1.5 py-0.5 rounded"
                            style={{ background: daysLabel.urgent ? "rgba(239, 68, 68, 0.2)" : "var(--bg-card)", color: daysLabel.color }}
                          >
                            {daysLabel.text}
                          </span>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {event.date}
                            {event.time && ` • ${event.time}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: category.bg, color: category.color }}
                          >
                            {category.label}
                          </span>
                          <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {event.event}
                          </span>
                        </div>
                      </div>

                      {/* Right: Impact & Bias */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>
                            IMPACT
                          </div>
                          <div className="text-xs tracking-wider" style={{ color: getImpactColor(event.impact) }}>
                            {getImpactStars(event.impact)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>
                            TYPICAL
                          </div>
                          <div className="text-xs font-semibold flex items-center gap-1" style={{ color: bias.color }}>
                            <span className="text-base">{bias.icon}</span>
                            <span className="hidden sm:inline">{bias.text}</span>
                          </div>
                        </div>
                        <svg
                          className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          style={{ color: "var(--text-muted)" }}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div
                      className="px-4 pb-4 pt-0 border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--accent-blue)" }}>
                            WHY IT MATTERS
                          </div>
                          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                            {event.whyItMatters}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--accent-amber)" }}>
                            BIAS EXPLANATION
                          </div>
                          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                            {event.biasExplanation}
                          </div>
                        </div>
                      </div>
                      {event.actionableInsight && (
                        <div
                          className="mt-4 p-3 rounded-lg"
                          style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.2)" }}
                        >
                          <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--accent-green)" }}>
                            ACTIONABLE INSIGHT
                          </div>
                          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                            {event.actionableInsight}
                          </div>
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

      {/* Coming Up */}
      {comingUp.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Coming Up
            <span className="text-xs font-normal ml-2" style={{ color: "var(--text-muted)" }}>
              {comingUp.length} event{comingUp.length !== 1 ? "s" : ""}
            </span>
          </h2>

          <div className="space-y-2">
            {comingUp.map((event) => {
              const category = getCategoryLabel(event.category);
              const bias = getBiasIndicator(event.typicalBias);
              const daysLabel = getDaysLabel(event.daysFromNow);

              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg"
                  style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: "var(--bg-card)", color: daysLabel.color }}
                    >
                      {daysLabel.text}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: category.bg, color: category.color }}
                    >
                      {category.label}
                    </span>
                    <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                      {event.event}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs tracking-wider hidden sm:block" style={{ color: getImpactColor(event.impact) }}>
                      {getImpactStars(event.impact)}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: bias.color }}>
                      {bias.icon}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No Events */}
      {events.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-lg mb-2" style={{ color: "var(--text-primary)" }}>
            No upcoming events
          </div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            Check back later for USDINR-moving events
          </div>
        </div>
      )}

      {/* Methodology Footer */}
      {methodology && (
        <div className="text-xs p-3 rounded-lg" style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}>
          <strong>Methodology:</strong> {methodology}
        </div>
      )}

      {/* Legend */}
      <div className="card p-4">
        <div className="text-xs font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          Understanding the Signals
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Impact Rating</div>
            <div style={{ color: "var(--accent-red)" }}>★★★★★ = Major mover</div>
            <div style={{ color: "var(--accent-amber)" }}>★★★★☆ = High impact</div>
            <div style={{ color: "var(--accent-blue)" }}>★★★☆☆ = Moderate</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Typical Bias</div>
            <div style={{ color: "var(--accent-red)" }}>↑ = USDINR tends to rise</div>
            <div style={{ color: "var(--accent-green)" }}>↓ = USDINR tends to fall</div>
            <div style={{ color: "var(--accent-amber)" }}>↔ = High volatility both ways</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Categories</div>
            <div><span className="text-red-400">FED</span> = US Federal Reserve</div>
            <div><span className="text-blue-400">US DATA</span> = US Economic Data</div>
            <div><span className="text-orange-400">RBI/INDIA</span> = India Central Bank/Data</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Timing</div>
            <div><span className="text-red-400">TODAY/TOMORROW</span> = Urgent</div>
            <div><span className="text-amber-400">2-7d</span> = This week</div>
            <div style={{ color: "var(--text-muted)" }}>8d+ = Coming up</div>
          </div>
        </div>
      </div>
    </div>
  );
}
