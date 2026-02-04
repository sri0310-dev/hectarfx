"use client";

import { useEffect, useState } from "react";
import { PnlBadge } from "../components/PnlBadge";

type Trade = {
  tradeId: string;
  commodity: string;
  usdInvoice: number;
  inrSale: number;
  inrSaleDate: string;
  mtbFx: number;
  mtmFx?: number;
  notes?: string;
};

function formatUSD(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatINR(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [spot, setSpot] = useState(0);
  const [sortField, setSortField] = useState<string>("inrSaleDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/trades").then((r) => r.json()),
      fetch("/api/fx").then((r) => r.json()),
    ]).then(([td, fd]) => {
      setTrades(td.trades || []);
      setSpot(fd.fx?.spot || 86.20);
      setLoading(false);
    });
  }, []);

  const sorted = [...trades].sort((a, b) => {
    let va: number | string = (a as Record<string, unknown>)[sortField] as string;
    let vb: number | string = (b as Record<string, unknown>)[sortField] as string;
    if (typeof va === "number" && typeof vb === "number") {
      return sortDir === "asc" ? va - vb : vb - va;
    }
    va = String(va || "");
    vb = String(vb || "");
    return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const totalUsd = trades.reduce((s, t) => s + t.usdInvoice, 0);
  const totalInr = trades.reduce((s, t) => s + t.inrSale, 0);
  const totalPnl = trades.reduce(
    (s, t) => s + (t.mtbFx - spot) * t.usdInvoice,
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading trades...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Open Trades</h1>
          <p className="text-sm text-slate-400 mt-1">
            {trades.length} positions &middot; Spot: {spot.toFixed(4)}
          </p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="stat-label">Total Exposure</div>
          <div className="stat-value text-blue-400 mt-1">{formatUSD(totalUsd)}</div>
        </div>
        <div className="card">
          <div className="stat-label">INR Receivable</div>
          <div className="stat-value text-cyan-400 mt-1">{formatINR(totalInr)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Aggregate MTM P&L</div>
          <div className={`stat-value mt-1 ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatINR(totalPnl)}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Avg Implied Rate</div>
          <div className="stat-value text-amber-400 mt-1">
            {totalUsd > 0 ? (totalInr / totalUsd).toFixed(4) : "—"}
          </div>
        </div>
      </div>

      {/* Trades table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a3650]">
                {[
                  { key: "tradeId", label: "Trade ID" },
                  { key: "commodity", label: "Commodity" },
                  { key: "usdInvoice", label: "USD Invoice" },
                  { key: "inrSale", label: "INR Sale" },
                  { key: "inrSaleDate", label: "Sale Date" },
                  { key: "mtbFx", label: "Book Rate" },
                  { key: "mtmPnl", label: "MTM P&L" },
                ].map((col) => (
                  <th
                    key={col.key}
                    className="table-header cursor-pointer hover:text-slate-200"
                    onClick={() => toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortField === col.key && (
                        <span className="text-blue-400">
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3650]/50">
              {sorted.map((t) => {
                const pnl = (t.mtbFx - spot) * t.usdInvoice;
                return (
                  <tr
                    key={t.tradeId}
                    className="hover:bg-[#1e2a3f] transition-colors"
                  >
                    <td className="table-cell font-mono text-blue-400 text-xs">
                      {t.tradeId}
                    </td>
                    <td className="table-cell text-slate-200">{t.commodity}</td>
                    <td className="table-cell font-mono text-slate-200">
                      {formatUSD(t.usdInvoice)}
                    </td>
                    <td className="table-cell font-mono text-slate-200">
                      {formatINR(t.inrSale)}
                    </td>
                    <td className="table-cell text-slate-300">{t.inrSaleDate}</td>
                    <td className="table-cell font-mono text-amber-400">
                      {t.mtbFx.toFixed(4)}
                    </td>
                    <td className="table-cell">
                      <PnlBadge value={pnl} format="INR" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
