import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ── Active Hedge type ──
export type ActiveHedge = {
  id: string;
  ticketNo: string;
  bank: string;
  type: "FORWARD" | "OPTION" | "OTHER";
  direction: "BUY_USD" | "SELL_USD";
  usdAmount: number;
  rate: number;
  inrAmount: number;
  settlementDate: string; // YYYY-MM-DD
  contractDate: string;   // YYYY-MM-DD
  status: "ACTIVE" | "SETTLED" | "CANCELLED";
  createdAt: string;
  notes?: string;
};

type AuditEntry = {
  id: string;
  timestamp: string;
  action: "CREATED" | "CANCELLED" | "SETTLED" | "DELETED";
  hedgeId: string;
  ticketNo: string;
  summary: string;
};

// ── In-memory storage (use DB in production) ──
let activeHedges: ActiveHedge[] = [
  {
    id: "HDG-001",
    ticketNo: "24203642",
    bank: "Kotak",
    type: "FORWARD",
    direction: "BUY_USD",
    usdAmount: 80000,
    rate: 90.68,
    inrAmount: 7254400,
    settlementDate: "2026-02-27",
    contractDate: "2026-02-04",
    status: "ACTIVE",
    createdAt: "2026-02-04T16:21:59.000Z",
    notes: "FXLive Deal - Karthick Ravi (KMBL80995)",
  },
  {
    id: "HDG-002",
    ticketNo: "24210163",
    bank: "Kotak",
    type: "FORWARD",
    direction: "BUY_USD",
    usdAmount: 80000,
    rate: 90.40,
    inrAmount: 7232000,
    settlementDate: "2026-02-27",
    contractDate: "2026-02-05",
    status: "ACTIVE",
    createdAt: "2026-02-05T12:58:50.000Z",
    notes: "FXLive Deal - Karthick Ravi (KMBL80995)",
  },
];

let hedgeAudit: AuditEntry[] = [
  {
    id: "HA-1",
    timestamp: "2026-02-04T16:21:59.000Z",
    action: "CREATED",
    hedgeId: "HDG-001",
    ticketNo: "24203642",
    summary: "FORWARD: BOUGHT 80,000 USD @ 90.6800, settlement 27-Feb-2026 (Kotak)",
  },
  {
    id: "HA-2",
    timestamp: "2026-02-05T12:58:50.000Z",
    action: "CREATED",
    hedgeId: "HDG-002",
    ticketNo: "24210163",
    summary: "FORWARD: BOUGHT 80,000 USD @ 90.4000, settlement 27-Feb-2026 (Kotak)",
  },
];

let hedgeIdCounter = 3;
let auditIdCounter = 3;

export async function GET() {
  return NextResponse.json({
    hedges: activeHedges,
    audit: hedgeAudit,
    summary: {
      totalActive: activeHedges.filter((h) => h.status === "ACTIVE").length,
      totalUsd: activeHedges
        .filter((h) => h.status === "ACTIVE")
        .reduce((s, h) => s + h.usdAmount, 0),
      totalInr: activeHedges
        .filter((h) => h.status === "ACTIVE")
        .reduce((s, h) => s + h.inrAmount, 0),
      avgRate:
        activeHedges.filter((h) => h.status === "ACTIVE").length > 0
          ? activeHedges
              .filter((h) => h.status === "ACTIVE")
              .reduce((s, h) => s + h.rate * h.usdAmount, 0) /
            activeHedges
              .filter((h) => h.status === "ACTIVE")
              .reduce((s, h) => s + h.usdAmount, 0)
          : 0,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Handle status updates (cancel/settle)
    if (body.action === "cancel" || body.action === "settle") {
      const hedge = activeHedges.find((h) => h.id === body.hedgeId);
      if (!hedge) {
        return NextResponse.json({ error: "Hedge not found" }, { status: 404 });
      }
      hedge.status = body.action === "cancel" ? "CANCELLED" : "SETTLED";

      hedgeAudit.unshift({
        id: `HA-${auditIdCounter++}`,
        timestamp: new Date().toISOString(),
        action: body.action === "cancel" ? "CANCELLED" : "SETTLED",
        hedgeId: hedge.id,
        ticketNo: hedge.ticketNo,
        summary: `${hedge.type}: ${hedge.usdAmount.toLocaleString()} USD @ ${hedge.rate.toFixed(4)} marked as ${hedge.status}`,
      });

      return NextResponse.json({ success: true, hedge });
    }

    // Handle delete
    if (body.action === "delete") {
      const idx = activeHedges.findIndex((h) => h.id === body.hedgeId);
      if (idx === -1) {
        return NextResponse.json({ error: "Hedge not found" }, { status: 404 });
      }
      const removed = activeHedges.splice(idx, 1)[0];

      hedgeAudit.unshift({
        id: `HA-${auditIdCounter++}`,
        timestamp: new Date().toISOString(),
        action: "DELETED",
        hedgeId: removed.id,
        ticketNo: removed.ticketNo,
        summary: `Deleted ${removed.type}: ${removed.usdAmount.toLocaleString()} USD @ ${removed.rate.toFixed(4)}`,
      });

      return NextResponse.json({ success: true });
    }

    // Create new hedge
    const id = `HDG-${String(hedgeIdCounter++).padStart(3, "0")}`;
    const usdAmount = Number(body.usdAmount) || 0;
    const rate = Number(body.rate) || 0;
    const inrAmount = body.inrAmount ? Number(body.inrAmount) : usdAmount * rate;

    const hedge: ActiveHedge = {
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

    activeHedges.push(hedge);

    hedgeAudit.unshift({
      id: `HA-${auditIdCounter++}`,
      timestamp: new Date().toISOString(),
      action: "CREATED",
      hedgeId: hedge.id,
      ticketNo: hedge.ticketNo,
      summary: `${hedge.type}: ${hedge.direction === "BUY_USD" ? "BOUGHT" : "SOLD"} ${hedge.usdAmount.toLocaleString()} USD @ ${hedge.rate.toFixed(4)}, settlement ${hedge.settlementDate} (${hedge.bank})`,
    });

    return NextResponse.json({ success: true, hedge });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
