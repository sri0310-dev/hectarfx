import { NextResponse } from "next/server";
import { fetchTradesFromSheet, getDemoTrades } from "@/lib/sheets";

// Force dynamic — never cache, always pull fresh from Google Sheets
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const trades = await fetchTradesFromSheet();
    const fetchedAt = new Date().toISOString();
    return NextResponse.json({
      trades,
      fetchedAt,
      source: process.env.SHEET_ID ? "google_sheets" : "demo",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to fetch trades:", message);
    // Fall back to demo data on error
    const trades = getDemoTrades();
    return NextResponse.json({
      error: message,
      trades,
      fetchedAt: new Date().toISOString(),
      source: "demo_fallback",
    });
  }
}
