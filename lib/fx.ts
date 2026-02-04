// ─── FX utility functions ───

export function toNumber(x: unknown): number {
  if (x === null || x === undefined) return 0;
  const n = Number(String(x).replace(/[,₹$\s]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function parseDate(x: unknown): string {
  if (!x) return "";
  const s = String(x).trim();

  // DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m1) {
    const dd = m1[1].padStart(2, "0");
    const mm = m1[2].padStart(2, "0");
    return `${m1[3]}-${mm}-${dd}`;
  }

  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return s;

  // MM/DD/YYYY (US format fallback)
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m3) {
    const mm = m3[1].padStart(2, "0");
    const dd = m3[2].padStart(2, "0");
    return `${m3[3]}-${mm}-${dd}`;
  }

  return "";
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatINR(n: number): string {
  if (Math.abs(n) >= 1e7) {
    return `₹${(n / 1e7).toFixed(2)} Cr`;
  }
  if (Math.abs(n) >= 1e5) {
    return `₹${(n / 1e5).toFixed(2)} L`;
  }
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatUSD(n: number): string {
  if (Math.abs(n) >= 1e6) {
    return `$${(n / 1e6).toFixed(2)}M`;
  }
  if (Math.abs(n) >= 1e3) {
    return `$${(n / 1e3).toFixed(1)}K`;
  }
  return `$${n.toFixed(2)}`;
}

export function formatRate(n: number): string {
  return n.toFixed(4);
}

export function generateSpotPath(
  startDate: string,
  endDate: string,
  startSpot: number,
  endSpot: number,
  volatility: number = 0.05
): { date: string; spot: number }[] {
  const days = daysBetween(startDate, endDate);
  if (days <= 0) return [{ date: startDate, spot: startSpot }];

  const drift = (endSpot - startSpot) / days;
  const path: { date: string; spot: number }[] = [];

  let spot = startSpot;
  for (let i = 0; i <= days; i++) {
    const date = addDays(startDate, i);
    // Simple random walk with drift toward target
    if (i === days) {
      spot = endSpot;
    } else if (i > 0) {
      const noise = (Math.random() - 0.5) * volatility;
      spot = spot + drift + noise;
    }
    path.push({ date, spot: Math.round(spot * 10000) / 10000 });
  }

  return path;
}

// Forward points approximation (simplified)
export function forwardRate(spot: number, tenorMonths: number, inrRate: number = 6.5, usdRate: number = 4.5): number {
  const years = tenorMonths / 12;
  const points = spot * ((1 + inrRate / 100) / (1 + usdRate / 100) - 1) * years;
  return Math.round((spot + points) * 10000) / 10000;
}
