import { NextResponse } from "next/server";
import { AlertRule } from "@/lib/types";

// In-memory alert store (production: use database)
let alertRules: AlertRule[] = [
  {
    id: "default-1",
    type: "SPOT_ABOVE",
    level: 87.00,
    message: "USDINR spot crossed 87.00 — consider hedging",
    enabled: true,
    channel: "EMAIL",
  },
  {
    id: "default-2",
    type: "SPOT_BELOW",
    level: 85.50,
    message: "USDINR spot below 85.50 — favourable for unhedged position",
    enabled: true,
    channel: "EMAIL",
  },
];

export async function GET() {
  return NextResponse.json({ alerts: alertRules });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "add") {
      const rule: AlertRule = {
        id: `alert-${Date.now()}`,
        type: body.type || "SPOT_ABOVE",
        level: Number(body.level),
        message: body.message || "",
        enabled: true,
        channel: body.channel || "EMAIL",
      };
      alertRules.push(rule);
      return NextResponse.json({ alert: rule });
    }

    if (body.action === "delete") {
      alertRules = alertRules.filter((a) => a.id !== body.id);
      return NextResponse.json({ success: true });
    }

    if (body.action === "toggle") {
      const rule = alertRules.find((a) => a.id === body.id);
      if (rule) rule.enabled = !rule.enabled;
      return NextResponse.json({ alert: rule });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
