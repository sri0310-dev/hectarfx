"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type FxData = {
  spot: number;
  fwd1m: number;
  fwd2m: number;
  fwd3m: number;
  fwd6m?: number;
  fwd12m?: number;
  updatedAt?: string;
};

export default function FxBoardPage() {
  const [fx, setFx] = useState<FxData | null>(null);
  const [editSpot, setEditSpot] = useState("");
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/fx")
      .then((r) => r.json())
      .then((d) => {
        setFx(d.fx);
        setEditSpot(String(d.fx.spot));
      });
  }, []);

  async function updateRates() {
    const body: Record<string, number> = { spot: Number(editSpot) };
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) body[k] = Number(v);
    });

    const res = await fetch("/api/fx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setFx(d.fx);
    setEditing(false);
    setOverrides({});
  }

  if (!fx) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading FX data...</div>
      </div>
    );
  }

  // Forward curve chart data
  const curveData = [
    { tenor: "Spot", rate: fx.spot, months: 0 },
    { tenor: "1M", rate: fx.fwd1m, months: 1 },
    { tenor: "2M", rate: fx.fwd2m, months: 2 },
    { tenor: "3M", rate: fx.fwd3m, months: 3 },
    { tenor: "6M", rate: fx.fwd6m || 0, months: 6 },
    { tenor: "12M", rate: fx.fwd12m || 0, months: 12 },
  ].filter((d) => d.rate > 0);

  const minRate = Math.min(...curveData.map((d) => d.rate)) - 0.2;
  const maxRate = Math.max(...curveData.map((d) => d.rate)) + 0.2;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">FX Board</h1>
          <p className="text-sm text-slate-400 mt-1">
            USDINR rates &middot; Updated{" "}
            {fx.updatedAt
              ? new Date(fx.updatedAt).toLocaleTimeString()
              : "just now"}
          </p>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className={editing ? "btn-danger" : "btn-primary"}
        >
          {editing ? "Cancel" : "Edit Rates"}
        </button>
      </div>

      {/* Rate cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { key: "spot", label: "Spot", rate: fx.spot },
          { key: "fwd1m", label: "1M Forward", rate: fx.fwd1m },
          { key: "fwd2m", label: "2M Forward", rate: fx.fwd2m },
          { key: "fwd3m", label: "3M Forward", rate: fx.fwd3m },
          { key: "fwd6m", label: "6M Forward", rate: fx.fwd6m || 0 },
          { key: "fwd12m", label: "12M Forward", rate: fx.fwd12m || 0 },
        ].map((item) => {
          const points = item.rate > 0 ? ((item.rate - fx.spot) * 100).toFixed(1) : "—";
          return (
            <div key={item.key} className="card-hover text-center">
              <div className="text-xs text-slate-500 uppercase tracking-wider">
                {item.label}
              </div>
              {editing && item.key !== "spot" ? (
                <input
                  className="input-field mt-2 text-center text-lg font-bold"
                  value={overrides[item.key] || String(item.rate)}
                  onChange={(e) =>
                    setOverrides({ ...overrides, [item.key]: e.target.value })
                  }
                />
              ) : (
                <div className="text-2xl font-bold text-white mt-2">
                  {item.rate > 0 ? item.rate.toFixed(4) : "—"}
                </div>
              )}
              {item.key !== "spot" && item.rate > 0 && (
                <div
                  className={`text-xs mt-1 ${
                    Number(points) > 0 ? "text-amber-400" : "text-green-400"
                  }`}
                >
                  {Number(points) > 0 ? "+" : ""}{points} paise
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Spot input when editing */}
      {editing && (
        <div className="card">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm text-slate-400 block mb-1">
                Spot USDINR
              </label>
              <input
                className="input-field text-lg font-bold"
                value={editSpot}
                onChange={(e) => setEditSpot(e.target.value)}
              />
            </div>
            <button onClick={updateRates} className="btn-success">
              Update All Rates
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Forward rates will auto-calculate from spot using interest rate
            differential (INR 6.5% / USD 4.5%). Override individual forwards
            above if needed.
          </p>
        </div>
      )}

      {/* Forward curve chart */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">
          USDINR Forward Curve
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={curveData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3650" />
            <XAxis
              dataKey="tenor"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={{ stroke: "#2a3650" }}
            />
            <YAxis
              domain={[minRate, maxRate]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "#2a3650" }}
              tickFormatter={(v) => v.toFixed(2)}
            />
            <Tooltip
              contentStyle={{
                background: "#1a2234",
                border: "1px solid #2a3650",
                borderRadius: 8,
                color: "#f1f5f9",
              }}
              formatter={(value: number) => [value.toFixed(4), "Rate"]}
            />
            <ReferenceLine
              y={fx.spot}
              stroke="#64748b"
              strokeDasharray="5 5"
              label={{ value: "Spot", fill: "#64748b", fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{ fill: "#3b82f6", r: 5, strokeWidth: 2, stroke: "#1a2234" }}
              activeDot={{ r: 7, fill: "#60a5fa" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Points table */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">
          Forward Points Detail
        </h3>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2a3650]">
              <th className="table-header">Tenor</th>
              <th className="table-header">Rate</th>
              <th className="table-header">Points (paise)</th>
              <th className="table-header">Annualised Premium (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a3650]/50">
            {curveData.filter((d) => d.months > 0).map((d) => {
              const pts = (d.rate - fx.spot) * 100;
              const annPrem = ((d.rate - fx.spot) / fx.spot) * (12 / d.months) * 100;
              return (
                <tr key={d.tenor} className="hover:bg-[#1e2a3f]">
                  <td className="table-cell font-medium text-slate-200">
                    {d.tenor}
                  </td>
                  <td className="table-cell font-mono text-slate-200">
                    {d.rate.toFixed(4)}
                  </td>
                  <td className="table-cell font-mono text-amber-400">
                    {pts > 0 ? "+" : ""}
                    {pts.toFixed(1)}
                  </td>
                  <td className="table-cell font-mono text-cyan-400">
                    {annPrem.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
