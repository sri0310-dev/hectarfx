"use client";

export function PnlBadge({ value, format = "INR" }: { value: number; format?: "INR" | "USD" }) {
  const isPositive = value >= 0;
  const label = format === "INR"
    ? `${isPositive ? "+" : ""}${formatINR(value)}`
    : `${isPositive ? "+" : ""}${formatUSD(value)}`;

  return (
    <span className={isPositive ? "badge-green" : "badge-red"}>
      {label}
    </span>
  );
}

function formatINR(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatUSD(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
