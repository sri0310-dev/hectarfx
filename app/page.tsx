"use client";

import { useEffect, useState, useCallback } from "react";
// Link removed - no longer needed for this page
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PnlBadge } from "./components/PnlBadge";
import EventWatch from "./components/EventWatch";

type Trade = {
  tradeId: string;
  commodity: string;
  quantityMt: number;
  arrivalDate: string;
  usdInvoice: number;
  inrSale: number;
  inrSaleDate: string;
  mtbFx: number;
  mtmFx?: number;
  mtbInr: number;
  mtmInr: number;
  hedgeStrategy?: string;
};

type FxData = {
  spot: number;
  fwd1m: number;
  fwd2m: number;
  fwd3m: number;
  fwd6m?: number;
  fwd12m?: number;
  updatedAt?: string;
};


const COLORS = ["#3b82f6", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function formatINR(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatUSD(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [fx, setFx] = useState<FxData | null>(null);
  const [pairs, setPairs] = useState<Record<string, number>>({});
  const [fxSource, setFxSource] = useState("");
  const [loading, setLoading] = useState(true);

  // Toggles - default to day view for maturity timeline
  const [maturityView, setMaturityView] = useState<"month" | "day">("day");
  const [currencyUnit, setCurrencyUnit] = useState<"USD" | "INR">("USD");

  // Hedges for blended hedged rate
  const [hedges, setHedges] = useState<{ usdAmount: number; rate: number; status: string }[]>([]);

  const fetchFx = useCallback(async () => {
    try {
      const res = await fetch("/api/fx");
      const data = await res.json();
      if (data.fx) {
        setFx(data.fx);
        setPairs(data.pairs || {});
        setFxSource(data.source || "");
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/trades").then((r) => r.json()),
      fetch("/api/fx").then((r) => r.json()),
      fetch("/api/hedges").then((r) => r.json()),
    ]).then(([tradesData, fxData, hedgesData]) => {
      setTrades(tradesData.trades || []);
      setFx(fxData.fx);
      setPairs(fxData.pairs || {});
      setFxSource(fxData.source || "");
      setHedges(hedgesData.hedges || []);
      setLoading(false);
    });

    // Auto-refresh FX every 60s
    const interval = setInterval(fetchFx, 60_000);
    return () => clearInterval(interval);
  }, [fetchFx]);

  if (loading || !fx) {
    return (
      <div className="flex items-center justify-center h-96">
        <div style={{ color: "var(--text-secondary)" }}>Loading dashboard...</div>
      </div>
    );
  }

  const spot = fx.spot;
  const totalUsd = trades.reduce((s, t) => s + t.usdInvoice, 0);
  const totalInr = trades.reduce((s, t) => s + t.inrSale, 0);
  const totalMtb = trades.reduce((s, t) => s + t.mtbInr, 0);
  const totalMtm = trades.reduce((s, t) => s + t.mtmInr, 0);
  const fxGainLoss = totalMtm - totalMtb;

  const blendedMtb =
    totalUsd > 0
      ? trades.reduce((s, t) => s + t.mtbFx * t.usdInvoice, 0) / totalUsd
      : 0;

  // Blended hedged rate from active hedges
  const activeHedges = hedges.filter((h) => h.status === "ACTIVE");
  const totalHedgedUsd = activeHedges.reduce((s, h) => s + h.usdAmount, 0);
  const blendedHedgeRate =
    totalHedgedUsd > 0
      ? activeHedges.reduce((s, h) => s + h.rate * h.usdAmount, 0) / totalHedgedUsd
      : 0;

  // FX Loss/Gain is calculated vs Mark-to-Book (what traders booked the deal at)
  // If spot drops (INR strengthens), we get fewer INR per USD = gain vs book
  // If spot rises (INR weakens), we pay more INR per USD = loss vs book

  // FX P&L per trade - in selected currency
  const barData = trades.map((t) => {
    const pnlUsd = t.mtmInr - t.mtbInr;
    return {
      name: t.commodity.length > 15 ? t.commodity.slice(0, 15) + "..." : t.commodity,
      pnl: currencyUnit === "USD" ? pnlUsd : pnlUsd * spot,
      exposure: currencyUnit === "USD" ? t.usdInvoice : t.usdInvoice * spot,
    };
  });

  // Exposure by commodity
  const commodityMap = new Map<string, number>();
  trades.forEach((t) => {
    const key = t.commodity.split("-")[0].trim() || "Other";
    const val = currencyUnit === "USD" ? t.usdInvoice : t.usdInvoice * spot;
    commodityMap.set(key, (commodityMap.get(key) || 0) + val);
  });
  const pieData = Array.from(commodityMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));

  // Maturity timeline - day or month view, USD or INR
  const timelineMap = new Map<string, number>();
  trades.forEach((t) => {
    if (!t.inrSaleDate) return;
    const key = maturityView === "month" ? t.inrSaleDate.slice(0, 7) : t.inrSaleDate;
    const val = currencyUnit === "USD" ? t.usdInvoice : t.usdInvoice * spot;
    timelineMap.set(key, (timelineMap.get(key) || 0) + val);
  });
  const maturityData = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, amount]) => ({
      label: maturityView === "day" ? label.slice(5) : label, // show MM-DD for day view
      amount,
    }));

  const fmt = currencyUnit === "USD" ? formatUSD : formatINR;
  const exposureFmt = currencyUnit === "USD" ? formatUSD(totalUsd) : formatINR(totalUsd * spot);
  const inrReceiptsFmt = formatINR(totalInr);

  // Multi-currency pairs
  const pairEntries = Object.entries(pairs);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Position overview &middot; {trades.length} open trades
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>USDINR Spot</div>
            {fxSource && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                {fxSource}
              </span>
            )}
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--accent-cyan)" }}>
            {spot.toFixed(4)}
          </div>
          {fx.updatedAt && (
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Updated {new Date(fx.updatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* FX Rate Sources */}
      <div className="card py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Live FX Rates</h3>
          <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
            Primary: Google Finance (Sheet J1) &middot; Closest to xe.com mid-market rates
          </span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--accent-cyan)" }}>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>USDINR</span>
            <span className="font-mono text-sm font-bold" style={{ color: "var(--accent-cyan)" }}>{spot.toFixed(4)}</span>
            {fxSource && <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{fxSource}</span>}
          </div>
          {pairEntries.map(([pair, rate]) => (
            <div key={pair} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{pair}</span>
              <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>{rate.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Global toggles */}
      <div className="flex items-center gap-3">
        <select
          value={currencyUnit}
          onChange={(e) => setCurrencyUnit(e.target.value as "USD" | "INR")}
          className="select-field text-xs py-1.5 px-3 w-auto"
        >
          <option value="USD">USD</option>
          <option value="INR">INR</option>
        </select>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Currency for exposure &amp; charts
        </span>
      </div>

      {/* KPI Cards - Flow: Exposure → INR Receipts → Book Rate → Hedged Rate → Spot → P&L */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="card">
          <div className="stat-label">Total Exposure</div>
          <div className="stat-value mt-1" style={{ color: "var(--accent-blue)" }}>{exposureFmt}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{trades.length} trades</div>
        </div>
        <div className="card">
          <div className="stat-label">INR Receipts</div>
          <div className="stat-value mt-1" style={{ color: "var(--accent-cyan)" }}>{inrReceiptsFmt}</div>
        </div>
        <div className="card">
          <div className="stat-label">Blended Book Rate</div>
          <div className="stat-value mt-1" style={{ color: "var(--accent-amber)" }}>
            {blendedMtb.toFixed(4)}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            MTB weighted avg
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Blended Hedge Rate</div>
          <div className="stat-value mt-1" style={{ color: "var(--accent-purple)" }}>
            {blendedHedgeRate > 0 ? blendedHedgeRate.toFixed(4) : "—"}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {totalHedgedUsd > 0 ? `${formatUSD(totalHedgedUsd)} hedged` : "No active hedges"}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">INR Spot</div>
          <div className="stat-value mt-1" style={{ color: "var(--accent-cyan)" }}>
            {spot.toFixed(4)}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {fxSource || "Live"}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">FX P&L vs Book</div>
          <div className="stat-value mt-1" style={{ color: fxGainLoss >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
            {fxGainLoss >= 0 ? "+" : ""}{formatUSD(fxGainLoss)}
          </div>
          <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            vs Mark-to-Book rate
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trade-level FX P&L bar chart */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            FX P&L by Trade (MTM - MTB) &middot; {currencyUnit}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--text-secondary)", fontSize: 9 }}
                axisLine={{ stroke: "var(--border)" }}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
                tickFormatter={(v) => fmt(v)}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                }}
                formatter={(value: number) => [fmt(value), "FX P&L"]}
              />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {barData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.pnl >= 0 ? "#16a34a" : "#dc2626"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Exposure by commodity pie chart */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Exposure by Commodity ({currencyUnit})
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={55}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={{ stroke: "var(--text-muted)" }}
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                }}
                formatter={(value: number) => [fmt(value), "Exposure"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Maturity timeline */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Exposure Maturity Timeline ({currencyUnit})
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <button
                onClick={() => setMaturityView("month")}
                className="px-3 py-1 text-xs transition-colors"
                style={{
                  background: maturityView === "month" ? "var(--accent-blue)" : "transparent",
                  color: maturityView === "month" ? "white" : "var(--text-secondary)",
                }}
              >
                Month
              </button>
              <button
                onClick={() => setMaturityView("day")}
                className="px-3 py-1 text-xs transition-colors"
                style={{
                  background: maturityView === "day" ? "var(--accent-blue)" : "transparent",
                  color: maturityView === "day" ? "white" : "var(--text-secondary)",
                }}
              >
                Day
              </button>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={maturityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--text-secondary)", fontSize: maturityView === "day" ? 9 : 11 }}
              axisLine={{ stroke: "var(--border)" }}
              angle={maturityView === "day" ? -30 : 0}
              textAnchor={maturityView === "day" ? "end" : "middle"}
              height={maturityView === "day" ? 50 : 30}
            />
            <YAxis
              tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={(v) => fmt(v)}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-primary)",
              }}
              formatter={(value: number) => [fmt(value), "Maturing"]}
            />
            <Bar dataKey="amount" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Event Watch - AI-powered economic calendar */}
      <EventWatch />

    </div>
  );
}
