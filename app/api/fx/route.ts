import { NextResponse } from "next/server";
import { forwardRate } from "@/lib/fx";
import { FxBoard } from "@/lib/types";

// In production, this would pull from a bank feed or market data API.
// For MVP, we use manually-set rates that can be updated via POST.
let currentFx: FxBoard = {
  spot: 86.20,
  fwd1m: 0,
  fwd2m: 0,
  fwd3m: 0,
  fwd6m: 0,
  fwd12m: 0,
  updatedAt: new Date().toISOString(),
};

// Auto-compute forwards from spot on init
function computeForwards(spot: number): Partial<FxBoard> {
  return {
    fwd1m: forwardRate(spot, 1),
    fwd2m: forwardRate(spot, 2),
    fwd3m: forwardRate(spot, 3),
    fwd6m: forwardRate(spot, 6),
    fwd12m: forwardRate(spot, 12),
  };
}

// Initialize forwards
Object.assign(currentFx, computeForwards(currentFx.spot));

export async function GET() {
  return NextResponse.json({ fx: currentFx });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.spot) {
      currentFx.spot = Number(body.spot);
      // Recompute forwards unless explicitly provided
      const computed = computeForwards(currentFx.spot);
      currentFx.fwd1m = body.fwd1m ? Number(body.fwd1m) : computed.fwd1m!;
      currentFx.fwd2m = body.fwd2m ? Number(body.fwd2m) : computed.fwd2m!;
      currentFx.fwd3m = body.fwd3m ? Number(body.fwd3m) : computed.fwd3m!;
      currentFx.fwd6m = body.fwd6m ? Number(body.fwd6m) : computed.fwd6m!;
      currentFx.fwd12m = body.fwd12m ? Number(body.fwd12m) : computed.fwd12m!;
      currentFx.updatedAt = new Date().toISOString();
    }
    return NextResponse.json({ fx: currentFx });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
