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
        <div className="text-slate-400">Loading dashboard...</div>
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
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Position overview &middot; {trades.length} open trades
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <div className="text-sm text-slate-400">USDINR Spot</div>
            {fxSource && (
              <span className="text-[10px] text-slate-600 px-1.5 py-0.5 rounded bg-[#1e2a3f]">
                {fxSource}
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-cyan-400">
            {spot.toFixed(4)}
          </div>
          {fx.updatedAt && (
            <div className="text-[10px] text-slate-600">
              Updated {new Date(fx.updatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* FX Rate Sources */}
      <div className="card py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Live FX Rates</h3>
          <span className="text-[9px] text-slate-600">
            Primary: Google Finance (Sheet J1) &middot; Closest to xe.com mid-market rates
          </span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#111827] rounded-lg border border-cyan-500/30">
            <span className="text-xs text-slate-400">USDINR</span>
            <span className="font-mono text-sm text-cyan-400 font-bold">{spot.toFixed(4)}</span>
            {fxSource && <span className="text-[9px] text-slate-600">{fxSource}</span>}
          </div>
          {pairEntries.map(([pair, rate]) => (
            <div key={pair} className="flex items-center gap-2 px-3 py-2 bg-[#111827] rounded-lg border border-[#2a3650]">
              <span className="text-xs text-slate-400">{pair}</span>
              <span className="font-mono text-sm text-slate-200">{rate.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Global toggles */}
      <div className="flex items-center gap-3">
        <select
          value={currencyUnit}
          onChange={(e) => setCurrencyUnit(e.target.value as "USD" | "INR")}
          className="input-field text-xs py-1.5 px-3 w-auto"
        >
          <option value="USD">USD</option>
          <option value="INR">INR</option>
        </select>
        <span className="text-[10px] text-slate-600">
          Currency for exposure &amp; charts
        </span>
      </div>

      {/* KPI Cards - Flow: Exposure → INR Receipts → Book Rate → Hedged Rate → Spot → P&L */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="card">
          <div className="stat-label">Total Exposure</div>
          <div className="stat-value text-blue-400 mt-1">{exposureFmt}</div>
          <div className="text-xs text-slate-500 mt-1">{trades.length} trades</div>
        </div>
        <div className="card">
          <div className="stat-label">INR Receipts</div>
          <div className="stat-value text-cyan-400 mt-1">{inrReceiptsFmt}</div>
        </div>
        <div className="card">
          <div className="stat-label">Blended Book Rate</div>
          <div className="stat-value text-amber-400 mt-1">
            {blendedMtb.toFixed(4)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            MTB weighted avg
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Blended Hedge Rate</div>
          <div className="stat-value text-purple-400 mt-1">
            {blendedHedgeRate > 0 ? blendedHedgeRate.toFixed(4) : "—"}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {totalHedgedUsd > 0 ? `${formatUSD(totalHedgedUsd)} hedged` : "No active hedges"}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">INR Spot</div>
          <div className="stat-value text-cyan-400 mt-1">
            {spot.toFixed(4)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {fxSource || "Live"}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">FX P&L vs Book</div>
          <div className={`stat-value mt-1 ${fxGainLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
            {fxGainLoss >= 0 ? "+" : ""}{formatUSD(fxGainLoss)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            vs Mark-to-Book rate
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trade-level FX P&L bar chart */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            FX P&L by Trade (MTM - MTB) &middot; {currencyUnit}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3650" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 9 }}
                axisLine={{ stroke: "#2a3650" }}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "#2a3650" }}
                tickFormatter={(v) => fmt(v)}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a2234",
                  border: "1px solid #2a3650",
                  borderRadius: 8,
                  color: "#f1f5f9",
                }}
                formatter={(value: number) => [fmt(value), "FX P&L"]}
              />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {barData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Exposure by commodity pie chart */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
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
                labelLine={{ stroke: "#64748b" }}
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#1a2234",
                  border: "1px solid #2a3650",
                  borderRadius: 8,
                  color: "#f1f5f9",
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
          <h3 className="text-sm font-semibold text-slate-300">
            Exposure Maturity Timeline ({currencyUnit})
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-[#2a3650]">
              <button
                onClick={() => setMaturityView("month")}
                className={`px-3 py-1 text-xs transition-colors ${
                  maturityView === "month"
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setMaturityView("day")}
                className={`px-3 py-1 text-xs transition-colors ${
                  maturityView === "day"
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Day
              </button>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={maturityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3650" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#94a3b8", fontSize: maturityView === "day" ? 9 : 11 }}
              axisLine={{ stroke: "#2a3650" }}
              angle={maturityView === "day" ? -30 : 0}
              textAnchor={maturityView === "day" ? "end" : "middle"}
              height={maturityView === "day" ? 50 : 30}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "#2a3650" }}
              tickFormatter={(v) => fmt(v)}
            />
            <Tooltip
              contentStyle={{
                background: "#1a2234",
                border: "1px solid #2a3650",
                borderRadius: 8,
                color: "#f1f5f9",
              }}
              formatter={(value: number) => [fmt(value), "Maturing"]}
            />
            <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
