import { NextResponse } from "next/server";
import { fetchTradesFromSheet } from "@/lib/sheets";

export async function GET() {
  try {
    const trades = await fetchTradesFromSheet();
    return NextResponse.json({ trades });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to fetch trades:", message);
    return NextResponse.json({ error: message, trades: [] }, { status: 500 });
  }
}
