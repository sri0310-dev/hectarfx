import { NextResponse } from "next/server";
import { fetchSimHedgesFromSheet, saveSimHedgesToSheet, SheetSimHedge } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET - Fetch all sim hedges from sheet
export async function GET() {
  try {
    const hedges = await fetchSimHedgesFromSheet();
    return NextResponse.json({ hedges, success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, hedges: [] }, { status: 500 });
  }
}

// POST - Save all sim hedges to sheet (replace all)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const hedges = body.hedges as SheetSimHedge[];

    if (!Array.isArray(hedges)) {
      return NextResponse.json({ error: "Invalid hedges data", success: false }, { status: 400 });
    }

    const success = await saveSimHedgesToSheet(hedges);

    if (success) {
      return NextResponse.json({ success: true, message: "Hedges saved to sheet" });
    } else {
      return NextResponse.json({ success: false, error: "Failed to save to sheet" }, { status: 500 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
