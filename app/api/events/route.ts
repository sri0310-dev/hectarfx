import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EconomicEvent = {
  date: string;
  event: string;
  country: "US" | "India";
  whyItMatters: string;
  usdInrBias: string;
  biasDirection: "up" | "down" | "mixed";
};

// Economic calendar knowledge base with AI-generated insights
const eventTemplates: {
  name: string;
  country: "US" | "India";
  // Function to calculate next occurrence date
  getNextDate: (fromDate: Date) => Date;
  whyItMatters: string;
  usdInrBias: string;
  biasDirection: "up" | "down" | "mixed";
}[] = [
  {
    name: "India CPI (rebased series)",
    country: "India",
    getNextDate: (from) => getNthWeekdayOfMonth(from, 12, 1, 1), // Around 12th of month
    whyItMatters: "If inflation scorecard changes, RBI expectations change → INR can wiggle.",
    usdInrBias: "Mixed / volatile",
    biasDirection: "mixed",
  },
  {
    name: "US CPI (Jan, BLS)",
    country: "US",
    getNextDate: (from) => getNthWeekdayOfMonth(from, 13, 1, 1), // Mid-month
    whyItMatters: "High prices → Fed stays stricter → USD can jump.",
    usdInrBias: "Hot CPI → USDINR ↑",
    biasDirection: "up",
  },
  {
    name: "US Retail Sales",
    country: "US",
    getNextDate: (from) => getNthWeekdayOfMonth(from, 17, 1, 1), // Around 17th
    whyItMatters: "Strong spending → US economy strong → USD can firm up.",
    usdInrBias: "Strong → USDINR ↑",
    biasDirection: "up",
  },
  {
    name: "India Core Industries",
    country: "India",
    getNextDate: (from) => getNthWeekdayOfMonth(from, 20, 1, 1), // Around 20th
    whyItMatters: "Growth vibes affect 'India confidence' → flows → INR moves.",
    usdInrBias: "Strong → USDINR ↓ (INR ↑)",
    biasDirection: "down",
  },
  {
    name: "India GDP (rebased series)",
    country: "India",
    getNextDate: (from) => getLastWeekdayOfMonth(from, 5), // End of month (quarterly)
    whyItMatters: "Growth score changes investor mood → money in/out → INR moves.",
    usdInrBias: "Strong → USDINR ↓",
    biasDirection: "down",
  },
  {
    name: "RBI Policy Decision",
    country: "India",
    getNextDate: (from) => getBiMonthlyRbiDate(from), // Bi-monthly
    whyItMatters: "Rate cuts → INR weaker, Rate hikes → INR stronger. RBI tone matters.",
    usdInrBias: "Dovish → USDINR ↑, Hawkish → USDINR ↓",
    biasDirection: "mixed",
  },
  {
    name: "US Fed FOMC Decision",
    country: "US",
    getNextDate: (from) => getFomcDate(from), // ~6 weeks apart
    whyItMatters: "Fed rate decisions drive global USD flows. Hawkish = strong USD.",
    usdInrBias: "Hawkish → USDINR ↑",
    biasDirection: "up",
  },
  {
    name: "US Non-Farm Payrolls",
    country: "US",
    getNextDate: (from) => getFirstFridayOfMonth(from), // First Friday
    whyItMatters: "Jobs report = US economy health check. Strong jobs = Fed stays tight.",
    usdInrBias: "Strong jobs → USDINR ↑",
    biasDirection: "up",
  },
  {
    name: "India Trade Balance",
    country: "India",
    getNextDate: (from) => getNthWeekdayOfMonth(from, 15, 1, 1), // Mid-month
    whyItMatters: "Trade deficit = INR pressure. Surplus = INR support. Oil imports key.",
    usdInrBias: "Deficit ↑ → USDINR ↑",
    biasDirection: "up",
  },
  {
    name: "US PCE Inflation",
    country: "US",
    getNextDate: (from) => getLastWeekdayOfMonth(from, 5), // End of month
    whyItMatters: "Fed's favorite inflation gauge. Hot PCE = Fed hawkish = USD strong.",
    usdInrBias: "Hot PCE → USDINR ↑",
    biasDirection: "up",
  },
];

// Helper functions for date calculations
function getNthWeekdayOfMonth(from: Date, targetDay: number, weekday: number, n: number): Date {
  const result = new Date(from);
  result.setDate(targetDay);
  // If date has passed, move to next month
  if (result <= from) {
    result.setMonth(result.getMonth() + 1);
  }
  return result;
}

function getLastWeekdayOfMonth(from: Date, weekday: number): Date {
  const result = new Date(from);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0); // Last day of current month
  // Move to last Friday
  while (result.getDay() !== weekday) {
    result.setDate(result.getDate() - 1);
  }
  if (result <= from) {
    result.setMonth(result.getMonth() + 2);
    result.setDate(0);
    while (result.getDay() !== weekday) {
      result.setDate(result.getDate() - 1);
    }
  }
  return result;
}

function getFirstFridayOfMonth(from: Date): Date {
  const result = new Date(from);
  result.setMonth(result.getMonth() + 1);
  result.setDate(1);
  while (result.getDay() !== 5) {
    result.setDate(result.getDate() + 1);
  }
  if (result <= from) {
    result.setMonth(result.getMonth() + 1);
    result.setDate(1);
    while (result.getDay() !== 5) {
      result.setDate(result.getDate() + 1);
    }
  }
  return result;
}

function getBiMonthlyRbiDate(from: Date): Date {
  // RBI meets in Feb, Apr, Jun, Aug, Oct, Dec (bi-monthly)
  const rbiMonths = [1, 3, 5, 7, 9, 11]; // 0-indexed
  const result = new Date(from);
  for (let i = 0; i < 12; i++) {
    const checkMonth = (from.getMonth() + i) % 12;
    if (rbiMonths.includes(checkMonth)) {
      result.setMonth(from.getMonth() + i);
      result.setDate(7); // Usually first week
      if (result > from) return result;
    }
  }
  result.setMonth(from.getMonth() + 2);
  result.setDate(7);
  return result;
}

function getFomcDate(from: Date): Date {
  // FOMC meets roughly every 6 weeks
  const result = new Date(from);
  result.setDate(result.getDate() + 42); // ~6 weeks
  // Move to Wednesday
  while (result.getDay() !== 3) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function formatEventDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function GET() {
  const today = new Date();
  const twoWeeksFromNow = new Date(today);
  twoWeeksFromNow.setDate(today.getDate() + 14);

  // Generate upcoming events
  const events: EconomicEvent[] = [];

  for (const template of eventTemplates) {
    const eventDate = template.getNextDate(today);

    // Only include events within next 14 days
    if (eventDate >= today && eventDate <= twoWeeksFromNow) {
      events.push({
        date: formatEventDate(eventDate),
        event: template.name,
        country: template.country,
        whyItMatters: template.whyItMatters,
        usdInrBias: template.usdInrBias,
        biasDirection: template.biasDirection,
      });
    }
  }

  // Sort by date
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return NextResponse.json({
    events,
    generatedAt: new Date().toISOString(),
    note: "*Bias means: \"if this surprises hot/cold, what direction is typical\". Real moves depend on expectations + positioning.",
  });
}
