import { NextResponse } from "next/server";
import { runSimulation } from "@/lib/simulate";
import { SimulationRequest } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body: SimulationRequest = await req.json();

    if (!body.trades || !body.strategy || !body.scenarios) {
      return NextResponse.json(
        { error: "Missing required fields: trades, strategy, scenarios" },
        { status: 400 }
      );
    }

    const results = runSimulation(body);
    return NextResponse.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Simulation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
