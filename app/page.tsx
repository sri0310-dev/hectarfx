"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  Legend,
} from "recharts";
import { PnlBadge } from "./components/PnlBadge";

type Trade = {
  tradeId: string;
  commodity: string;
  usdInvoice: number;
  inrSale: number;
  inrSaleDate: string;
  mtbFx: number;
  mtmFx?: number;
};

type FxData = {
  spot: number;
  fwd1m: number;
  fwd2m: number;
  fwd3m: number;
};

type Suggestion = {
  strategy: string;
  label: string;
  rationale: string;
  expectedSavingInr: number;
  riskLevel: string;
  confidence: number;
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/trades").then((r) => r.json()),
      fetch("/api/fx").then((r) => r.json()),
    ]).then(([tradesData, fxData]) => {
      setTrades(tradesData.trades || []);
      setFx(fxData.fx);

      // Fetch suggestions
      if (tradesData.trades?.length && fxData.fx) {
        fetch("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trades: tradesData.trades, fx: fxData.fx }),
        })
          .then((r) => r.json())
          .then((d) => setSuggestions(d.suggestions || []));
      }

      setLoading(false);
    });
  }, []);

  if (loading || !fx) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  const totalUsd = trades.reduce((s, t) => s + t.usdInvoice, 0);
  const totalInr = trades.reduce((s, t) => s + t.inrSale, 0);
  const blendedMtb =
    totalUsd > 0
      ? trades.reduce((s, t) => s + t.mtbFx * t.usdInvoice, 0) / totalUsd
      : 0;
  const mtmPnlInr = trades.reduce(
    (s, t) => s + (t.mtbFx - fx.spot) * t.usdInvoice,
    0
  );

  // Chart data: exposure by commodity
  const commodityMap = new Map<string, number>();
  trades.forEach((t) => {
    const key = t.commodity || "Other";
    commodityMap.set(key, (commodityMap.get(key) || 0) + t.usdInvoice);
  });
  const pieData = Array.from(commodityMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));

  // Chart data: trade-level MTM P&L
  const barData = trades.map((t) => ({
    name: t.tradeId,
    pnl: Math.round((t.mtbFx - fx.spot) * t.usdInvoice),
    exposure: t.usdInvoice,
  }));

  // Maturity timeline
  const monthMap = new Map<string, number>();
  trades.forEach((t) => {
    if (t.inrSaleDate) {
      const month = t.inrSaleDate.slice(0, 7);
      monthMap.set(month, (monthMap.get(month) || 0) + t.usdInvoice);
    }
  });
  const maturityData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, usd]) => ({ month, usd }));

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
          <div className="text-sm text-slate-400">USDINR Spot</div>
          <div className="text-2xl font-bold text-cyan-400">
            {fx.spot.toFixed(4)}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="stat-label">Total USD Exposure</div>
          <div className="stat-value text-blue-400 mt-1">{formatUSD(totalUsd)}</div>
          <div className="text-xs text-slate-500 mt-1">{trades.length} active trades</div>
        </div>
        <div className="card">
          <div className="stat-label">Expected INR Receipts</div>
          <div className="stat-value text-cyan-400 mt-1">{formatINR(totalInr)}</div>
          <div className="text-xs text-slate-500 mt-1">Total INR sales value</div>
        </div>
        <div className="card">
          <div className="stat-label">Blended Book Rate</div>
          <div className="stat-value text-amber-400 mt-1">
            {blendedMtb.toFixed(4)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Spot: {fx.spot.toFixed(4)} | Delta: {(blendedMtb - fx.spot).toFixed(4)}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">MTM P&L (vs Book)</div>
          <div className={`stat-value mt-1 ${mtmPnlInr >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatINR(mtmPnlInr)}
          </div>
          <div className="mt-1">
            <PnlBadge value={mtmPnlInr} format="INR" />
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trade-level P&L bar chart */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            Trade-Level MTM P&L (INR)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3650" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                axisLine={{ stroke: "#2a3650" }}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "#2a3650" }}
                tickFormatter={(v) => {
                  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(0)}L`;
                  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
                  return v;
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a2234",
                  border: "1px solid #2a3650",
                  borderRadius: 8,
                  color: "#f1f5f9",
                }}
                formatter={(value: number) => [formatINR(value), "MTM P&L"]}
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
            Exposure by Commodity (USD)
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
                formatter={(value: number) => [formatUSD(value), "Exposure"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Maturity timeline */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">
          Exposure Maturity Timeline (USD)
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={maturityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3650" />
            <XAxis
              dataKey="month"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "#2a3650" }}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "#2a3650" }}
              tickFormatter={(v) => formatUSD(v)}
            />
            <Tooltip
              contentStyle={{
                background: "#1a2234",
                border: "1px solid #2a3650",
                borderRadius: 8,
                color: "#f1f5f9",
              }}
              formatter={(value: number) => [formatUSD(value), "Maturing"]}
            />
            <Bar dataKey="usd" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Strategy Suggestions */}
      {suggestions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-300">
              Strategy Suggestions
            </h3>
            <Link href="/simulator" className="text-xs text-blue-400 hover:text-blue-300">
              Open Simulator &rarr;
            </Link>
          </div>
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="p-4 bg-[#111827] rounded-lg border border-[#2a3650] hover:border-blue-500/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-200">
                        {s.label}
                      </span>
                      <span
                        className={`badge ${
                          s.riskLevel === "LOW"
                            ? "badge-green"
                            : s.riskLevel === "MEDIUM"
                            ? "badge-amber"
                            : "badge-red"
                        }`}
                      >
                        {s.riskLevel} risk
                      </span>
                      <span className="badge-blue">
                        {Math.round(s.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      {s.rationale}
                    </p>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-xs text-slate-500">Est. Saving</div>
                    <div className="text-sm font-medium text-green-400">
                      {formatINR(s.expectedSavingInr)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forward Rates Quick View */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-300">Forward Curve</h3>
          <Link href="/fxboard" className="text-xs text-blue-400 hover:text-blue-300">
            FX Board &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "Spot", rate: fx.spot },
            { label: "1M Fwd", rate: fx.fwd1m },
            { label: "2M Fwd", rate: fx.fwd2m },
            { label: "3M Fwd", rate: fx.fwd3m },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="text-xs text-slate-500">{item.label}</div>
              <div className="text-lg font-semibold text-slate-200 mt-1">
                {item.rate.toFixed(4)}
              </div>
              {item.label !== "Spot" && (
                <div className="text-[10px] text-slate-500 mt-0.5">
                  +{((item.rate - fx.spot) * 100).toFixed(1)} paise
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
