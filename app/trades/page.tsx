"use client";

import { useEffect, useState } from "react";
import { PnlBadge } from "../components/PnlBadge";

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
      setSpot(fd.fx?.spot || 90.29);
      setLoading(false);
    });
  }, []);

  const sorted = [...trades].sort((a, b) => {
    const va = (a as Record<string, unknown>)[sortField];
    const vb = (b as Record<string, unknown>)[sortField];
    if (typeof va === "number" && typeof vb === "number") {
      return sortDir === "asc" ? va - vb : vb - va;
    }
    const sa = String(va || "");
    const sb = String(vb || "");
    return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
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
  const totalMtb = trades.reduce((s, t) => s + t.mtbInr, 0);
  const totalMtm = trades.reduce((s, t) => s + t.mtmInr, 0);
  const fxGainLoss = totalMtm - totalMtb;
  const totalQty = trades.reduce((s, t) => s + t.quantityMt, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading trades...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Open Trades</h1>
          <p className="text-sm text-slate-400 mt-1">
            {trades.length} positions &middot; Spot: {spot.toFixed(4)}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="card">
          <div className="stat-label">Total USD Exposure</div>
          <div className="stat-value text-blue-400 mt-1">{formatUSD(totalUsd)}</div>
        </div>
        <div className="card">
          <div className="stat-label">INR Sales Total</div>
          <div className="stat-value text-cyan-400 mt-1">{formatINR(totalInr)}</div>
        </div>
        <div className="card">
          <div className="stat-label">MTB Total</div>
          <div className="stat-value text-amber-400 mt-1">{formatUSD(totalMtb)}</div>
        </div>
        <div className="card">
          <div className="stat-label">MTM Total</div>
          <div className="stat-value text-slate-200 mt-1">{formatUSD(totalMtm)}</div>
        </div>
        <div className="card">
          <div className="stat-label">FX Loss/Gain</div>
          <div className={`stat-value mt-1 ${fxGainLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
            {fxGainLoss >= 0 ? "+" : ""}{formatUSD(fxGainLoss)}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Total Quantity</div>
          <div className="stat-value text-slate-200 mt-1">{totalQty.toFixed(1)} MT</div>
        </div>
      </div>

      {/* Trades table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a3650]">
                {[
                  { key: "tradeId", label: "ID" },
                  { key: "commodity", label: "Commodity" },
                  { key: "quantityMt", label: "Qty (MT)" },
                  { key: "arrivalDate", label: "Arrival" },
                  { key: "usdInvoice", label: "USD Invoice" },
                  { key: "inrSale", label: "INR Sales" },
                  { key: "inrSaleDate", label: "Sale Date" },
                  { key: "mtbFx", label: "MTB Rate" },
                  { key: "mtmFx", label: "MTM Rate" },
                  { key: "mtbInr", label: "Marked to Book" },
                  { key: "mtmInr", label: "Marked to Mkt" },
                  { key: "fxPnl", label: "FX P&L" },
                ].map((col) => (
                  <th
                    key={col.key}
                    className="table-header cursor-pointer hover:text-slate-200 whitespace-nowrap"
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
                const fxPnl = t.mtmInr - t.mtbInr;
                return (
                  <tr
                    key={t.tradeId}
                    className="hover:bg-[#1e2a3f] transition-colors"
                  >
                    <td className="table-cell font-mono text-blue-400 text-xs">
                      {t.tradeId}
                    </td>
                    <td className="table-cell text-slate-200 whitespace-nowrap">{t.commodity}</td>
                    <td className="table-cell font-mono text-slate-300">
                      {t.quantityMt.toFixed(1)}
                    </td>
                    <td className="table-cell text-slate-400 text-xs">{t.arrivalDate}</td>
                    <td className="table-cell font-mono text-slate-200">
                      {formatUSD(t.usdInvoice)}
                    </td>
                    <td className="table-cell font-mono text-slate-200">
                      {formatINR(t.inrSale)}
                    </td>
                    <td className="table-cell text-slate-300 text-xs">{t.inrSaleDate}</td>
                    <td className="table-cell font-mono text-amber-400 text-xs">
                      {t.mtbFx.toFixed(4)}
                    </td>
                    <td className="table-cell font-mono text-cyan-400 text-xs">
                      {(t.mtmFx || 0).toFixed(4)}
                    </td>
                    <td className="table-cell font-mono text-slate-300 text-xs">
                      {formatUSD(t.mtbInr)}
                    </td>
                    <td className="table-cell font-mono text-slate-300 text-xs">
                      {formatUSD(t.mtmInr)}
                    </td>
                    <td className="table-cell">
                      <PnlBadge value={fxPnl} format="USD" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2a3650] bg-[#111827]">
                <td className="table-cell font-bold text-slate-300" colSpan={2}>
                  Total
                </td>
                <td className="table-cell font-mono font-bold text-slate-200">
                  {totalQty.toFixed(1)}
                </td>
                <td className="table-cell" />
                <td className="table-cell font-mono font-bold text-slate-200">
                  {formatUSD(totalUsd)}
                </td>
                <td className="table-cell font-mono font-bold text-slate-200">
                  {formatINR(totalInr)}
                </td>
                <td className="table-cell" />
                <td className="table-cell" />
                <td className="table-cell" />
                <td className="table-cell font-mono font-bold text-amber-400">
                  {formatUSD(totalMtb)}
                </td>
                <td className="table-cell font-mono font-bold text-cyan-400">
                  {formatUSD(totalMtm)}
                </td>
                <td className="table-cell">
                  <PnlBadge value={fxGainLoss} format="USD" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
