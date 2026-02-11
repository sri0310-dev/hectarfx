"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MarketEvent = {
  id: string;
  dateISO: string;
  dateDisplay: string;
  daysFromNow: number;
  time?: string;
  event: string;
  category: "fed" | "us_data" | "rbi" | "india_data" | "global" | "oil" | "flows";
  impact: 1 | 2 | 3 | 4 | 5;
  typicalBias: "usdinr_up" | "usdinr_down" | "volatile" | "depends";
};

export default function EventWatch() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getImpactColor = (impact: number) => {
    if (impact >= 5) return "var(--accent-red)";
    if (impact >= 4) return "var(--accent-amber)";
    return "var(--accent-blue)";
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, { label: string; color: string; bg: string }> = {
      fed: { label: "FED", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },
      us_data: { label: "US", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" },
      rbi: { label: "RBI", color: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },
      india_data: { label: "IND", color: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },
      oil: { label: "OIL", color: "#84cc16", bg: "rgba(132, 204, 22, 0.15)" },
    };
    return labels[category] || { label: category.slice(0, 3).toUpperCase(), color: "var(--text-muted)", bg: "rgba(128,128,128,0.15)" };
  };

  const getBiasIcon = (bias: string) => {
    switch (bias) {
      case "usdinr_up": return { icon: "↑", color: "var(--accent-red)" };
      case "usdinr_down": return { icon: "↓", color: "var(--accent-green)" };
      case "volatile": return { icon: "↔", color: "var(--accent-amber)" };
      default: return { icon: "?", color: "var(--accent-blue)" };
    }
  };

  const getDaysLabel = (days: number) => {
    if (days === 0) return { text: "TODAY", color: "var(--accent-red)" };
    if (days === 1) return { text: "TMRW", color: "var(--accent-amber)" };
    if (days <= 3) return { text: `${days}d`, color: "var(--accent-amber)" };
    return { text: `${days}d`, color: "var(--text-muted)" };
  };

  // Show only this week's events (max 4)
  const thisWeek = events.filter((e) => e.daysFromNow <= 7).slice(0, 4);
  const highImpactCount = events.filter((e) => e.impact >= 4 && e.daysFromNow <= 7).length;

  if (loading) {
    return (
      <div className="card p-4">
        <div className="animate-pulse">
          <div className="h-5 bg-gray-700 rounded w-40 mb-3"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-700/50 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Event Watch
          </h3>
          {highImpactCount > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium animate-pulse"
              style={{ background: "rgba(239, 68, 68, 0.2)", color: "var(--accent-red)" }}
            >
              {highImpactCount} HIGH IMPACT
            </span>
          )}
        </div>
        <Link
          href="/events"
          className="text-xs flex items-center gap-1 transition-colors hover:opacity-80"
          style={{ color: "var(--accent-blue)" }}
        >
          View all
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {thisWeek.length === 0 ? (
        <div className="text-xs py-3 text-center" style={{ color: "var(--text-muted)" }}>
          No major events this week
        </div>
      ) : (
        <div className="space-y-2">
          {thisWeek.map((event) => {
            const category = getCategoryLabel(event.category);
            const bias = getBiasIcon(event.typicalBias);
            const daysLabel = getDaysLabel(event.daysFromNow);

            return (
              <div
                key={event.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg"
                style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[10px] font-bold px-1 py-0.5 rounded flex-shrink-0"
                    style={{ color: daysLabel.color }}
                  >
                    {daysLabel.text}
                  </span>
                  <span
                    className="text-[9px] font-semibold px-1 py-0.5 rounded flex-shrink-0"
                    style={{ background: category.bg, color: category.color }}
                  >
                    {category.label}
                  </span>
                  <span className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                    {event.event}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px]" style={{ color: getImpactColor(event.impact) }}>
                    {"★".repeat(event.impact)}
                  </span>
                  <span className="text-sm font-bold" style={{ color: bias.color }}>
                    {bias.icon}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick insight */}
      <div className="mt-3 pt-3 text-[10px]" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
        ↑ = USDINR up (INR weaker) &middot; ↓ = USDINR down (INR stronger) &middot; ★★★★★ = Major mover
      </div>
    </div>
  );
}
