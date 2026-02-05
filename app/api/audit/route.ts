import { NextResponse } from "next/server";
import { fetchTradesFromSheet } from "@/lib/sheets";
import { Trade } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// In-memory audit log (in production, use a database)
type AuditEntry = {
  id: string;
  timestamp: string;
  type: "SNAPSHOT" | "CHANGE_DETECTED";
  summary: string;
  tradeCount: number;
  totalUsd: number;
  totalMtb: number;
  totalMtm: number;
  changes?: {
    field: string;
    tradeId: string;
    commodity: string;
    oldValue: string;
    newValue: string;
  }[];
};

let auditLog: AuditEntry[] = [];
let lastSnapshot: Trade[] = [];
let lastFetchTime = "";

function diffTrades(oldTrades: Trade[], newTrades: Trade[]) {
  const changes: AuditEntry["changes"] = [];
  const oldMap = new Map(oldTrades.map((t) => [t.tradeId, t]));
  const newMap = new Map(newTrades.map((t) => [t.tradeId, t]));

  // Check for modified and new trades
  newTrades.forEach((nt) => {
    const ot = oldMap.get(nt.tradeId);
    if (!ot) {
      changes.push({
        field: "NEW_TRADE",
        tradeId: nt.tradeId,
        commodity: nt.commodity,
        oldValue: "—",
        newValue: `$${nt.usdInvoice.toLocaleString()}`,
      });
      return;
    }
    // Compare key fields
    const fields: (keyof Trade)[] = [
      "usdInvoice", "inrSale", "mtbInr", "mtmInr", "inrSaleDate",
      "commodity", "hedgeStrategy",
    ];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const ov = ot[field];
      const nv = nt[field];
      if (String(ov) !== String(nv)) {
        changes.push({
          field,
          tradeId: nt.tradeId,
          commodity: nt.commodity,
          oldValue: String(ov ?? ""),
          newValue: String(nv ?? ""),
        });
      }
    }
  });

  // Check for removed trades
  oldTrades.forEach((ot) => {
    if (!newMap.has(ot.tradeId)) {
      changes.push({
        field: "REMOVED_TRADE",
        tradeId: ot.tradeId,
        commodity: ot.commodity,
        oldValue: `$${ot.usdInvoice.toLocaleString()}`,
        newValue: "—",
      });
    }
  });

  return changes;
}

export async function GET() {
  // Fetch current data and compare with last snapshot
  try {
    const trades = await fetchTradesFromSheet();
    const now = new Date().toISOString();
    const totalUsd = trades.reduce((s, t) => s + t.usdInvoice, 0);
    const totalMtb = trades.reduce((s, t) => s + t.mtbInr, 0);
    const totalMtm = trades.reduce((s, t) => s + t.mtmInr, 0);

    if (lastSnapshot.length > 0) {
      const changes = diffTrades(lastSnapshot, trades);
      if (changes.length > 0) {
        auditLog.unshift({
          id: `AUD-${Date.now()}`,
          timestamp: now,
          type: "CHANGE_DETECTED",
          summary: `${changes.length} change(s) detected in Google Sheet`,
          tradeCount: trades.length,
          totalUsd,
          totalMtb,
          totalMtm,
          changes,
        });
      }
    }

    // Always log a snapshot
    if (!lastFetchTime || now > lastFetchTime) {
      if (lastSnapshot.length === 0 || auditLog.length === 0) {
        auditLog.unshift({
          id: `AUD-${Date.now()}`,
          timestamp: now,
          type: "SNAPSHOT",
          summary: `Fetched ${trades.length} trades from sheet`,
          tradeCount: trades.length,
          totalUsd,
          totalMtb,
          totalMtm,
        });
      }
      lastSnapshot = trades;
      lastFetchTime = now;
    }

    // Cap log at 100 entries
    if (auditLog.length > 100) auditLog = auditLog.slice(0, 100);

    return NextResponse.json({
      audit: auditLog,
      lastFetched: lastFetchTime,
      currentTradeCount: trades.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, audit: auditLog }, { status: 500 });
  }
}
