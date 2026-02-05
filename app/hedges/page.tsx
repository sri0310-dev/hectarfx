"use client";

import { useEffect, useState, useCallback } from "react";

type ActiveHedge = {
  id: string;
  ticketNo: string;
  bank: string;
  type: string;
  direction: string;
  usdAmount: number;
  rate: number;
  inrAmount: number;
  settlementDate: string;
  contractDate: string;
  status: string;
  createdAt: string;
  notes?: string;
};

type AuditEntry = {
  id: string;
  timestamp: string;
  action: string;
  hedgeId: string;
  ticketNo: string;
  summary: string;
};

type HedgeSummary = {
  totalActive: number;
  totalUsd: number;
  totalInr: number;
  avgRate: number;
};

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

export default function HedgesPage() {
  const [hedges, setHedges] = useState<ActiveHedge[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [summary, setSummary] = useState<HedgeSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Add hedge form
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"manual" | "paste">("manual");
  const [pasteText, setPasteText] = useState("");
  const [parseResult, setParseResult] = useState<string>("");

  // Manual form fields
  const [fDirection, setFDirection] = useState("BUY_USD");
  const [fUsd, setFUsd] = useState("");
  const [fRate, setFRate] = useState("");
  const [fSettlement, setFSettlement] = useState("");
  const [fContractDate, setFContractDate] = useState("");
  const [fTicket, setFTicket] = useState("");
  const [fBank, setFBank] = useState("Kotak");
  const [fType, setFType] = useState("FORWARD");
  const [fNotes, setFNotes] = useState("");

  // Drag state
  const [dragOver, setDragOver] = useState(false);

  const fetchHedges = useCallback(async () => {
    try {
      const res = await fetch("/api/hedges");
      const data = await res.json();
      setHedges(data.hedges || []);
      setAudit(data.audit || []);
      setSummary(data.summary || null);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHedges();
  }, [fetchHedges]);

  async function parseDealText() {
    if (!pasteText.trim()) return;
    setParseResult("Parsing...");
    try {
      const res = await fetch("/api/hedges/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (data.parsed && data.data) {
        const d = data.data;
        setFDirection(d.direction);
        setFUsd(String(d.usdAmount));
        setFRate(String(d.rate));
        setFSettlement(d.settlementDate);
        setFContractDate(d.contractDate);
        setFTicket(d.ticketNo || "");
        setFBank(d.bank || "Kotak");
        setFType(d.type || "FORWARD");
        setFNotes(d.notes || "");
        setFormMode("manual");
        setParseResult("Parsed successfully! Review and submit below.");
      } else {
        setParseResult(data.error || "Could not parse text.");
      }
    } catch {
      setParseResult("Parse failed. Try manual entry.");
    }
  }

  async function submitHedge() {
    const usdAmount = Number(fUsd);
    const rate = Number(fRate);
    if (!usdAmount || !rate || !fSettlement) {
      alert("USD Amount, Rate, and Settlement Date are required.");
      return;
    }

    try {
      const res = await fetch("/api/hedges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: fDirection,
          usdAmount,
          rate,
          inrAmount: usdAmount * rate,
          settlementDate: fSettlement,
          contractDate: fContractDate || new Date().toISOString().slice(0, 10),
          ticketNo: fTicket,
          bank: fBank,
          type: fType,
          notes: fNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        resetForm();
        setShowForm(false);
        fetchHedges();
      }
    } catch { /* silent */ }
  }

  async function updateHedgeStatus(hedgeId: string, action: "cancel" | "settle" | "delete") {
    const confirmMsg =
      action === "delete"
        ? "Delete this hedge permanently?"
        : `Mark this hedge as ${action === "cancel" ? "cancelled" : "settled"}?`;
    if (!confirm(confirmMsg)) return;

    try {
      await fetch("/api/hedges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, hedgeId }),
      });
      fetchHedges();
    } catch { /* silent */ }
  }

  function resetForm() {
    setFDirection("BUY_USD");
    setFUsd("");
    setFRate("");
    setFSettlement("");
    setFContractDate("");
    setFTicket("");
    setFBank("Kotak");
    setFType("FORWARD");
    setFNotes("");
    setPasteText("");
    setParseResult("");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    // Read text from dropped files or clipboard
    const text = e.dataTransfer.getData("text/plain");
    if (text) {
      setPasteText(text);
      setFormMode("paste");
    }
    // Handle file drops (show preview, ask to paste deal summary)
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setFormMode("paste");
      setParseResult("Screenshot received. Please paste the Deal Summary text from the email/screenshot into the text box above, then click Parse.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading hedges...</div>
      </div>
    );
  }

  const activeHedges = hedges.filter((h) => h.status === "ACTIVE");
  const inactiveHedges = hedges.filter((h) => h.status !== "ACTIVE");

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Hedges</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage active FX hedge contracts &middot; Bank deal tracking
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            if (!showForm) resetForm();
          }}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Hedge Contract"}
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="text-xs text-slate-500">Active Contracts</div>
            <div className="text-xl font-bold text-blue-400 mt-1">{summary.totalActive}</div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500">Total USD Hedged</div>
            <div className="text-xl font-bold text-cyan-400 mt-1">{formatUSD(summary.totalUsd)}</div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500">Total INR Locked</div>
            <div className="text-xl font-bold text-amber-400 mt-1">{formatINR(summary.totalInr)}</div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500">Avg Hedge Rate</div>
            <div className="text-xl font-bold text-green-400 mt-1">{summary.avgRate.toFixed(4)}</div>
          </div>
        </div>
      )}

      {/* Add Hedge Form */}
      {showForm && (
        <div
          className={`card border-2 ${dragOver ? "border-blue-500 bg-blue-500/5" : "border-[#2a3650]"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Add Hedge Contract</h3>

          {/* Mode tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFormMode("manual")}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                formMode === "manual"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-[#2a3650] text-slate-500"
              }`}
            >
              Manual Entry
            </button>
            <button
              onClick={() => setFormMode("paste")}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                formMode === "paste"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-[#2a3650] text-slate-500"
              }`}
            >
              Paste Deal Text / Drop Screenshot
            </button>
          </div>

          {formMode === "paste" && (
            <div className="mb-4">
              <p className="text-[11px] text-slate-500 mb-2">
                Paste the Deal Summary line from the Kotak FXLive email, or drag &amp; drop a screenshot of the deal confirmation.
              </p>
              <textarea
                className="input-field text-xs min-h-[80px] font-mono"
                placeholder='e.g., HECTAR INDIA TRADING PRIVATE LIMITED BOUGHT 80000.00 USD vs INR@90.6800 For 27-Feb-2026 (BROKEN)&#10;&#10;Or paste the full email text including Ticket No, Type, Date/Time fields...'
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={parseDealText}
                  className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
                >
                  Parse
                </button>
                {parseResult && (
                  <span className={`text-xs ${parseResult.includes("success") ? "text-green-400" : "text-amber-400"}`}>
                    {parseResult}
                  </span>
                )}
              </div>
            </div>
          )}

          {formMode === "manual" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Direction</label>
                  <select className="input-field text-xs py-1.5" value={fDirection} onChange={(e) => setFDirection(e.target.value)}>
                    <option value="BUY_USD">Buy USD (Forward)</option>
                    <option value="SELL_USD">Sell USD (Forward)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">USD Amount</label>
                  <input type="number" className="input-field text-xs py-1.5" placeholder="80000" value={fUsd} onChange={(e) => setFUsd(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Rate (USDINR)</label>
                  <input type="number" step="0.0001" className="input-field text-xs py-1.5" placeholder="90.68" value={fRate} onChange={(e) => setFRate(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">INR Amount</label>
                  <input
                    type="text"
                    className="input-field text-xs py-1.5 text-slate-500"
                    readOnly
                    value={fUsd && fRate ? `₹${(Number(fUsd) * Number(fRate)).toLocaleString("en-IN")}` : "—"}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Settlement Date</label>
                  <input type="date" className="input-field text-xs py-1.5" value={fSettlement} onChange={(e) => setFSettlement(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Contract Date</label>
                  <input type="date" className="input-field text-xs py-1.5" value={fContractDate} onChange={(e) => setFContractDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Ticket No</label>
                  <input type="text" className="input-field text-xs py-1.5" placeholder="24203642" value={fTicket} onChange={(e) => setFTicket(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Bank</label>
                  <input type="text" className="input-field text-xs py-1.5" placeholder="Kotak" value={fBank} onChange={(e) => setFBank(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Type</label>
                  <select className="input-field text-xs py-1.5" value={fType} onChange={(e) => setFType(e.target.value)}>
                    <option value="FORWARD">Forward</option>
                    <option value="OPTION">Option</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Notes</label>
                  <input type="text" className="input-field text-xs py-1.5" placeholder="Optional notes" value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
                </div>
              </div>
              <button
                onClick={submitHedge}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Add Hedge Contract
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active Hedges Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a3650]">
          <h3 className="text-sm font-semibold text-slate-300">Active Contracts ({activeHedges.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a3650]">
                <th className="table-header">ID</th>
                <th className="table-header">Ticket</th>
                <th className="table-header">Bank</th>
                <th className="table-header">Type</th>
                <th className="table-header text-right">USD</th>
                <th className="table-header text-right">Rate</th>
                <th className="table-header text-right">INR</th>
                <th className="table-header">Settlement</th>
                <th className="table-header">Booked</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3650]/50">
              {activeHedges.map((h) => (
                <tr key={h.id} className="hover:bg-[#1e2a3f]">
                  <td className="table-cell font-mono text-cyan-400 text-xs">{h.id}</td>
                  <td className="table-cell font-mono text-slate-400 text-xs">{h.ticketNo || "—"}</td>
                  <td className="table-cell text-slate-300 text-xs">{h.bank || "—"}</td>
                  <td className="table-cell text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px]">{h.type}</span>
                  </td>
                  <td className="table-cell font-mono text-slate-200 text-xs text-right">{formatUSD(h.usdAmount)}</td>
                  <td className="table-cell font-mono text-amber-400 text-xs text-right">{h.rate.toFixed(4)}</td>
                  <td className="table-cell font-mono text-slate-300 text-xs text-right">{formatINR(h.inrAmount)}</td>
                  <td className="table-cell font-mono text-slate-400 text-xs">{h.settlementDate}</td>
                  <td className="table-cell font-mono text-slate-500 text-xs">{h.contractDate}</td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      <button onClick={() => updateHedgeStatus(h.id, "settle")} className="text-[10px] px-2 py-0.5 rounded border border-green-500/30 text-green-400 hover:bg-green-500/10">Settle</button>
                      <button onClick={() => updateHedgeStatus(h.id, "cancel")} className="text-[10px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10">Cancel</button>
                      <button onClick={() => updateHedgeStatus(h.id, "delete")} className="text-[10px] px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {activeHedges.length === 0 && (
                <tr>
                  <td colSpan={10} className="table-cell text-center text-slate-600 py-8">No active hedges</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inactive hedges */}
      {inactiveHedges.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-[#2a3650]">
            <h3 className="text-sm font-semibold text-slate-500">Settled / Cancelled ({inactiveHedges.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a3650]">
                  <th className="table-header">ID</th>
                  <th className="table-header">Ticket</th>
                  <th className="table-header text-right">USD</th>
                  <th className="table-header text-right">Rate</th>
                  <th className="table-header">Settlement</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a3650]/50">
                {inactiveHedges.map((h) => (
                  <tr key={h.id} className="opacity-60">
                    <td className="table-cell font-mono text-xs">{h.id}</td>
                    <td className="table-cell font-mono text-xs">{h.ticketNo || "—"}</td>
                    <td className="table-cell font-mono text-xs text-right">{formatUSD(h.usdAmount)}</td>
                    <td className="table-cell font-mono text-xs text-right">{h.rate.toFixed(4)}</td>
                    <td className="table-cell font-mono text-xs">{h.settlementDate}</td>
                    <td className="table-cell text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        h.status === "SETTLED" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                      }`}>{h.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Trail */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a3650]">
          <h3 className="text-sm font-semibold text-slate-300">Hedge Audit Trail</h3>
        </div>
        <div className="divide-y divide-[#2a3650]/50">
          {audit.map((entry) => (
            <div key={entry.id} className="px-5 py-3 hover:bg-[#1e2a3f]">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  entry.action === "CREATED" ? "bg-green-500/10 text-green-400" :
                  entry.action === "SETTLED" ? "bg-blue-500/10 text-blue-400" :
                  entry.action === "CANCELLED" ? "bg-amber-500/10 text-amber-400" :
                  "bg-red-500/10 text-red-400"
                }`}>
                  {entry.action}
                </span>
                <span className="font-mono text-xs text-slate-500">{entry.hedgeId}</span>
                {entry.ticketNo && <span className="font-mono text-xs text-slate-600">#{entry.ticketNo}</span>}
                <span className="text-[10px] text-slate-600 ml-auto">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{entry.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
