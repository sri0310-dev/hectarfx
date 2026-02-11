"use client";

import { useEffect, useState } from "react";

type EconomicEvent = {
  date: string;
  event: string;
  country: "US" | "India";
  whyItMatters: string;
  usdInrBias: string;
  biasDirection: "up" | "down" | "mixed";
};

export default function EventWatch() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events || []);
        setNote(data.note || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card p-4">
        <div className="animate-pulse">
          <div className="h-5 bg-gray-700 rounded w-48 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-700/50 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const getBiasColor = (direction: string) => {
    switch (direction) {
      case "up":
        return "var(--accent-red)"; // USDINR up = INR weaker
      case "down":
        return "var(--accent-green)"; // USDINR down = INR stronger
      default:
        return "var(--accent-amber)"; // Mixed/volatile
    }
  };

  const getBiasIcon = (direction: string) => {
    switch (direction) {
      case "up":
        return "↑";
      case "down":
        return "↓";
      default:
        return "↔";
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Next 14 Days: Event Watch
        </h3>
        <span
          className="text-xs px-2 py-1 rounded"
          style={{ background: "var(--accent-purple)", color: "white" }}
        >
          AI Insights
        </span>
      </div>

      {/* Column Headers */}
      <div
        className="grid grid-cols-12 gap-2 pb-2 mb-2 text-xs font-medium"
        style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="col-span-2">Date</div>
        <div className="col-span-3">Event</div>
        <div className="col-span-4">Why a 5-year-old should care</div>
        <div className="col-span-3">USDINR bias*</div>
      </div>

      {/* Events */}
      <div className="space-y-2">
        {events.length === 0 ? (
          <div className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>
            No major events in the next 14 days
          </div>
        ) : (
          events.map((event, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 py-3 rounded-lg"
              style={{
                background: "var(--bg-card-hover)",
                border: "1px solid var(--border)",
                padding: "12px",
              }}
            >
              <div className="col-span-2">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {event.date.split(",")[0]}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {event.date.split(",")[1]?.trim() || ""}
                </div>
              </div>
              <div className="col-span-3">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {event.event}
                </div>
                <div
                  className="text-xs mt-0.5 px-1.5 py-0.5 rounded inline-block"
                  style={{
                    background: event.country === "US" ? "rgba(59, 130, 246, 0.2)" : "rgba(249, 115, 22, 0.2)",
                    color: event.country === "US" ? "var(--accent-blue)" : "var(--accent-amber)",
                  }}
                >
                  {event.country}
                </div>
              </div>
              <div className="col-span-4">
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {event.whyItMatters}
                </div>
              </div>
              <div className="col-span-3">
                <div
                  className="text-sm font-semibold flex items-center gap-1"
                  style={{ color: getBiasColor(event.biasDirection) }}
                >
                  <span>{event.usdInrBias}</span>
                  <span className="text-lg">{getBiasIcon(event.biasDirection)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer note */}
      {note && (
        <div className="mt-4 pt-3 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
          {note}
        </div>
      )}
    </div>
  );
}
