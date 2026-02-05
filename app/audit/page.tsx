"use client";

import { useEffect, useState, useCallback } from "react";

type AuditChange = {
  field: string;
  tradeId: string;
  commodity: string;
  oldValue: string;
  newValue: string;
};

type AuditEntry = {
  id: string;
  timestamp: string;
  type: "SNAPSHOT" | "CHANGE_DETECTED";
  summary: string;
  tradeCount: number;
  totalUsd: number;
  totalMtb: number;
  totalMtm: number;
  changes?: AuditChange[];
};

function formatUSD(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const FIELD_LABELS: Record<string, string> = {
  usdInvoice: "USD Invoice",
  inrSale: "INR Sales",
  mtbInr: "Marked to Book",
  mtmInr: "Marked to Market",
  inrSaleDate: "Sale Date",
  commodity: "Commodity",
  hedgeStrategy: "Hedge Strategy",
  NEW_TRADE: "New Trade Added",
  REMOVED_TRADE: "Trade Removed",
};

export default function AuditPage() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [lastFetched, setLastFetched] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAudit = useCallback(async () => {
    const res = await fetch("/api/audit");
    const data = await res.json();
    setAudit(data.audit || []);
    setLastFetched(data.lastFetched || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAudit();

    if (autoRefresh) {
      const interval = setInterval(fetchAudit, 30_000); // Check every 30s
      return () => clearInterval(interval);
    }
  }, [fetchAudit, autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading audit log...</div>
      </div>
    );
  }

  const changeEntries = audit.filter((a) => a.type === "CHANGE_DETECTED");
  const snapshotEntries = audit.filter((a) => a.type === "SNAPSHOT");

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track changes to your FX Strat Google Sheet
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn-secondary text-xs ${autoRefresh ? "border-green-500/50" : ""}`}
          >
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </button>
          <button onClick={fetchAudit} className="btn-primary text-xs">
            Check Now
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${autoRefresh ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
          <span className="text-sm text-slate-300">
            {autoRefresh ? "Monitoring for changes every 30s" : "Monitoring paused"}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Last fetched: {lastFetched ? timeAgo(lastFetched) : "never"}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <div className="stat-label">Total Checks</div>
          <div className="stat-value text-slate-200 mt-1">{audit.length}</div>
        </div>
        <div className="card">
          <div className="stat-label">Changes Detected</div>
          <div className={`stat-value mt-1 ${changeEntries.length > 0 ? "text-amber-400" : "text-green-400"}`}>
            {changeEntries.length}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Latest Trade Count</div>
          <div className="stat-value text-blue-400 mt-1">
            {audit[0]?.tradeCount || "—"}
          </div>
        </div>
      </div>

      {/* Audit entries */}
      <div className="space-y-3">
        {audit.length === 0 && (
          <div className="card text-center text-slate-500 py-12">
            No audit entries yet. The system will detect changes when the Google Sheet is modified.
          </div>
        )}
        {audit.map((entry) => (
          <div
            key={entry.id}
            className={`card ${
              entry.type === "CHANGE_DETECTED"
                ? "border-amber-500/30 bg-amber-500/5"
                : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                  entry.type === "CHANGE_DETECTED" ? "bg-amber-400" : "bg-slate-600"
                }`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${
                      entry.type === "CHANGE_DETECTED" ? "text-amber-300" : "text-slate-300"
                    }`}>
                      {entry.summary}
                    </span>
                    <span className={`badge ${
                      entry.type === "CHANGE_DETECTED" ? "badge-amber" : "badge-blue"
                    }`}>
                      {entry.type === "CHANGE_DETECTED" ? "CHANGED" : "SNAPSHOT"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {entry.tradeCount} trades &middot;
                    Exposure {formatUSD(entry.totalUsd)} &middot;
                    MTB {formatUSD(entry.totalMtb)} &middot;
                    MTM {formatUSD(entry.totalMtm)}
                  </div>

                  {/* Change details */}
                  {entry.changes && entry.changes.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {entry.changes.map((c, ci) => (
                        <div key={ci} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500 w-28 flex-shrink-0">
                            {FIELD_LABELS[c.field] || c.field}
                          </span>
                          <span className="text-blue-400 font-mono">{c.tradeId}</span>
                          <span className="text-slate-500">{c.commodity}</span>
                          <span className="text-red-400 font-mono line-through">{c.oldValue}</span>
                          <span className="text-slate-600">&rarr;</span>
                          <span className="text-green-400 font-mono">{c.newValue}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-xs text-slate-600 flex-shrink-0">
                {timeAgo(entry.timestamp)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
