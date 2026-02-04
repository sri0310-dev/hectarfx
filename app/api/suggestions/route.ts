import { NextResponse } from "next/server";
import { generateSuggestions } from "@/lib/suggestions";
import { FxBoard, Trade } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body: { trades: Trade[]; fx: FxBoard } = await req.json();

    if (!body.trades || !body.fx) {
      return NextResponse.json(
        { error: "Missing trades or fx data" },
        { status: 400 }
      );
    }

    const suggestions = generateSuggestions(body.trades, body.fx);
    return NextResponse.json({ suggestions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
