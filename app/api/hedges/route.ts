import { NextResponse } from "next/server";
import {
  fetchHedgesFromSheet,
  saveHedgesToSheet,
  SheetActiveHedge,
  SheetAuditEntry,
} from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Re-export types for use elsewhere
export type ActiveHedge = SheetActiveHedge;
export type AuditEntry = SheetAuditEntry;

// ── In-memory cache with short TTL for performance ──
let cachedHedges: SheetActiveHedge[] | null = null;
let cachedAudit: SheetAuditEntry[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10_000; // 10 seconds

let hedgeIdCounter = 1;
let auditIdCounter = 1;

async function getHedgesData(): Promise<{ hedges: SheetActiveHedge[]; audit: SheetAuditEntry[] }> {
  const now = Date.now();

  if (cachedHedges && cachedAudit && now - lastFetchTime < CACHE_TTL_MS) {
    return { hedges: cachedHedges, audit: cachedAudit };
  }

  const { hedges, audit } = await fetchHedgesFromSheet();

  // Update counters based on existing data
  if (hedges.length > 0) {
    const maxHedgeNum = Math.max(...hedges.map(h => {
      const match = h.id.match(/HDG-(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }));
    hedgeIdCounter = maxHedgeNum + 1;
  }
  if (audit.length > 0) {
    const maxAuditNum = Math.max(...audit.map(a => {
      const match = a.id.match(/HA-(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }));
    auditIdCounter = maxAuditNum + 1;
  }

  cachedHedges = hedges;
  cachedAudit = audit;
  lastFetchTime = now;

  return { hedges, audit };
}

async function saveHedgesData(hedges: SheetActiveHedge[], audit: SheetAuditEntry[]): Promise<boolean> {
  cachedHedges = hedges;
  cachedAudit = audit;
  lastFetchTime = Date.now();
  return await saveHedgesToSheet(hedges, audit);
}

export async function GET() {
  const { hedges, audit } = await getHedgesData();

  return NextResponse.json({
    hedges,
    audit,
    summary: {
      totalActive: hedges.filter((h) => h.status === "ACTIVE").length,
      totalUsd: hedges
        .filter((h) => h.status === "ACTIVE")
        .reduce((s, h) => s + h.usdAmount, 0),
      totalInr: hedges
        .filter((h) => h.status === "ACTIVE")
        .reduce((s, h) => s + h.inrAmount, 0),
      avgRate:
        hedges.filter((h) => h.status === "ACTIVE").length > 0
          ? hedges
              .filter((h) => h.status === "ACTIVE")
              .reduce((s, h) => s + h.rate * h.usdAmount, 0) /
            hedges
              .filter((h) => h.status === "ACTIVE")
              .reduce((s, h) => s + h.usdAmount, 0)
          : 0,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { hedges, audit } = await getHedgesData();

    // Handle status updates (cancel/settle)
    if (body.action === "cancel" || body.action === "settle") {
      const hedge = hedges.find((h) => h.id === body.hedgeId);
      if (!hedge) {
        return NextResponse.json({ error: "Hedge not found" }, { status: 404 });
      }
      hedge.status = body.action === "cancel" ? "CANCELLED" : "SETTLED";

      audit.unshift({
        id: `HA-${auditIdCounter++}`,
        timestamp: new Date().toISOString(),
        action: body.action === "cancel" ? "CANCELLED" : "SETTLED",
        hedgeId: hedge.id,
        ticketNo: hedge.ticketNo,
        summary: `${hedge.type}: ${hedge.usdAmount.toLocaleString()} USD @ ${hedge.rate.toFixed(4)} marked as ${hedge.status}`,
      });

      await saveHedgesData(hedges, audit);
      return NextResponse.json({ success: true, hedge });
    }

    // Handle delete
    if (body.action === "delete") {
      const idx = hedges.findIndex((h) => h.id === body.hedgeId);
      if (idx === -1) {
        return NextResponse.json({ error: "Hedge not found" }, { status: 404 });
      }
      const removed = hedges.splice(idx, 1)[0];

      audit.unshift({
        id: `HA-${auditIdCounter++}`,
        timestamp: new Date().toISOString(),
        action: "DELETED",
        hedgeId: removed.id,
        ticketNo: removed.ticketNo,
        summary: `Deleted ${removed.type}: ${removed.usdAmount.toLocaleString()} USD @ ${removed.rate.toFixed(4)}`,
      });

      await saveHedgesData(hedges, audit);
      return NextResponse.json({ success: true });
    }

    // Create new hedge
    const id = `HDG-${String(hedgeIdCounter++).padStart(3, "0")}`;
    const usdAmount = Number(body.usdAmount) || 0;
    const rate = Number(body.rate) || 0;
    const inrAmount = body.inrAmount ? Number(body.inrAmount) : usdAmount * rate;

    const hedge: SheetActiveHedge = {
      id,
      ticketNo: body.ticketNo || "",
      bank: body.bank || "",
      type: body.type || "FORWARD",
      direction: body.direction || "BUY_USD",
      usdAmount,
      rate,
      inrAmount,
      settlementDate: body.settlementDate || "",
      contractDate: body.contractDate || new Date().toISOString().slice(0, 10),
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      notes: body.notes || "",
    };

    hedges.push(hedge);

    audit.unshift({
      id: `HA-${auditIdCounter++}`,
      timestamp: new Date().toISOString(),
      action: "CREATED",
      hedgeId: hedge.id,
      ticketNo: hedge.ticketNo,
      summary: `${hedge.type}: ${hedge.direction === "BUY_USD" ? "BOUGHT" : "SOLD"} ${hedge.usdAmount.toLocaleString()} USD @ ${hedge.rate.toFixed(4)}, settlement ${hedge.settlementDate} (${hedge.bank})`,
    });

    await saveHedgesData(hedges, audit);
    return NextResponse.json({ success: true, hedge });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
