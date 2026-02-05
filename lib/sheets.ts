// ─── Google Sheets integration ───

import { Trade } from "./types";
import { toNumber, parseDate } from "./fx";

let googleModule: typeof import("googleapis") | null = null;

async function getGoogleAuth() {
  if (!googleModule) {
    googleModule = await import("googleapis");
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON env var");

  const creds = JSON.parse(raw);
  return new googleModule.google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

export async function readSheetValues(sheetId: string, range: string): Promise<string[][]> {
  const auth = await getGoogleAuth();
  const { google } = await import("googleapis");
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });

  return (res.data.values as string[][]) || [];
}

export async function fetchTradesFromSheet(): Promise<Trade[]> {
  const sheetId = process.env.SHEET_ID;
  const range = process.env.SHEET_RANGE || "USD-INR!A1:K100";

  if (!sheetId) {
    return getDemoTrades();
  }

  const rows = await readSheetValues(sheetId, range);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => String(h).trim().toLowerCase());
  const data = rows.slice(1);

  const findCol = (keywords: string[]) =>
    headers.findIndex((h) => keywords.some((k) => h.includes(k)));

  // Exact mapping for your "FX Strat" / "USD-INR" sheet:
  // A: Commodity | B: Quantity (MTs) | C: Arrival Date
  // D: Purchase Invoice Value (US$) | E: INR Sales (INR)
  // F: INR Sales Date (Approx) | G: Marked to Book | H: Marked to Market
  // I: Hedge Strategy
  const iCommodity = findCol(["commodity", "product", "item"]);
  const iQty = findCol(["quantity", "qty", "mts", "mt"]);
  const iArrival = findCol(["arrival", "arrival date"]);
  const iUsd = findCol(["purchase invoice", "invoice value", "us$"]);
  const iInr = findCol(["inr sale", "inr_sale", "inr sales"]);
  const iSaleDate = findCol(["sale date", "inr sales date", "receipt date", "saledate"]);
  const iMtb = findCol(["marked to book"]);
  const iMtm = findCol(["marked to market"]);
  const iHedge = findCol(["hedge strategy", "hedge"]);

  const trades: Trade[] = [];

  for (let idx = 0; idx < data.length; idx++) {
    const r = data[idx];
    // Skip empty rows or summary/total rows
    const commodity = iCommodity >= 0 ? String(r[iCommodity] ?? "").trim() : "";
    if (!commodity) continue;

    const usdInvoice = toNumber(iUsd >= 0 ? r[iUsd] : 0);
    if (usdInvoice <= 0) continue;

    const inrSale = toNumber(iInr >= 0 ? r[iInr] : 0);

    // G and H columns are USD amounts at book/market FX rates.
    // Implied USDINR rate = INR Sale / MTB(or MTM) USD amount.
    // E.g. row 1: INR 10,575,209 / MTB $117,242 = ~90.20 USDINR
    const mtbInr = toNumber(iMtb >= 0 ? r[iMtb] : 0);
    const mtmInr = toNumber(iMtm >= 0 ? r[iMtm] : 0);
    const mtbFx = mtbInr > 0 && inrSale > 0 ? inrSale / mtbInr : 0;
    const mtmFx = mtmInr > 0 && inrSale > 0 ? inrSale / mtmInr : 0;

    trades.push({
      tradeId: `HX-${String(idx + 1).padStart(3, "0")}`,
      commodity,
      quantityMt: toNumber(iQty >= 0 ? r[iQty] : 0),
      arrivalDate: iArrival >= 0 ? parseDate(r[iArrival]) : "",
      usdInvoice,
      inrSale,
      inrSaleDate: iSaleDate >= 0 ? parseDate(r[iSaleDate]) : "",
      mtbFx: Math.round(mtbFx * 10000) / 10000,
      mtmFx: Math.round(mtmFx * 10000) / 10000,
      mtbInr,
      mtmInr,
      hedgeStrategy: iHedge >= 0 ? String(r[iHedge] ?? "").trim() : "",
    });
  }

  return trades;
}

// Fetch the live spot rate from Google Finance formula in cell J1
export async function fetchSpotFromSheet(): Promise<number | null> {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) return null;

  try {
    const rows = await readSheetValues(sheetId, "USD-INR!J1");
    if (rows.length > 0 && rows[0].length > 0) {
      const raw = String(rows[0][0]).replace(/[^0-9.]/g, "");
      const rate = parseFloat(raw);
      if (rate > 50 && rate < 200) return rate;
    }
  } catch {
    // Sheet unavailable — caller should fall back
  }
  return null;
}

// Demo trades matching your actual sheet structure
export function getDemoTrades(): Trade[] {
  return [
    {
      tradeId: "HX-001",
      commodity: "Almonds - Crown",
      quantityMt: 20.412,
      arrivalDate: "2026-01-29",
      usdInvoice: 102186,
      inrSale: 10575209,
      inrSaleDate: "2026-02-08",
      mtbFx: 90.20,
      mtmFx: 90.29,
      mtbInr: 117242,
      mtmInr: 117123,
    },
    {
      tradeId: "HX-002",
      commodity: "RCN - RV",
      quantityMt: 180.140,
      arrivalDate: "2026-01-19",
      usdInvoice: 294528,
      inrSale: 29903240,
      inrSaleDate: "2026-02-10",
      mtbFx: 90.22,
      mtmFx: 90.27,
      mtbInr: 331522,
      mtmInr: 331187,
    },
    {
      tradeId: "HX-003",
      commodity: "Almonds - JSS",
      quantityMt: 20.412,
      arrivalDate: "2026-02-02",
      usdInvoice: 99942,
      inrSale: 11133521,
      inrSaleDate: "2026-02-12",
      mtbFx: 90.05,
      mtmFx: 90.15,
      mtbInr: 123431,
      mtmInr: 123307,
    },
    {
      tradeId: "HX-004",
      commodity: "Almonds - Supreme",
      quantityMt: 20.412,
      arrivalDate: "2026-02-02",
      usdInvoice: 99279,
      inrSale: 10136803,
      inrSaleDate: "2026-02-12",
      mtbFx: 90.28,
      mtmFx: 90.38,
      mtbInr: 112381,
      mtmInr: 112268,
    },
    {
      tradeId: "HX-005",
      commodity: "Soybean-PRT",
      quantityMt: 232.650,
      arrivalDate: "2026-02-02",
      usdInvoice: 124468,
      inrSale: 11911680,
      inrSaleDate: "2026-02-15",
      mtbFx: 90.32,
      mtmFx: 90.42,
      mtbInr: 132059,
      mtmInr: 131925,
    },
    {
      tradeId: "HX-006",
      commodity: "Soybean-MOI 1",
      quantityMt: 252.400,
      arrivalDate: "2026-02-04",
      usdInvoice: 128754,
      inrSale: 12922880,
      inrSaleDate: "2026-02-17",
      mtbFx: 90.36,
      mtmFx: 90.33,
      mtbInr: 143269,
      mtmInr: 143125,
    },
    {
      tradeId: "HX-007",
      commodity: "Almonds - Rotteveel",
      quantityMt: 20.412,
      arrivalDate: "2026-02-09",
      usdInvoice: 100805,
      inrSale: 11100000,
      inrSaleDate: "2026-02-19",
      mtbFx: 90.21,
      mtmFx: 90.31,
      mtbInr: 123060,
      mtmInr: 122936,
    },
    {
      tradeId: "HX-008",
      commodity: "Soybean - Zaks 8",
      quantityMt: 224.000,
      arrivalDate: "2026-02-11",
      usdInvoice: 110880,
      inrSale: 11468800,
      inrSaleDate: "2026-02-24",
      mtbFx: 90.15,
      mtmFx: 90.25,
      mtbInr: 127149,
      mtmInr: 127020,
    },
    {
      tradeId: "HX-009",
      commodity: "Soybean-MOI 2",
      quantityMt: 252.850,
      arrivalDate: "2026-02-20",
      usdInvoice: 128953,
      inrSale: 12945920,
      inrSaleDate: "2026-03-05",
      mtbFx: 90.24,
      mtmFx: 90.34,
      mtbInr: 143525,
      mtmInr: 143380,
    },
    {
      tradeId: "HX-010",
      commodity: "Soybean-MOI 3",
      quantityMt: 252.300,
      arrivalDate: "2026-02-20",
      usdInvoice: 128535,
      inrSale: 12917760,
      inrSaleDate: "2026-03-05",
      mtbFx: 90.19,
      mtmFx: 90.27,
      mtbInr: 143212,
      mtmInr: 143068,
    },
    {
      tradeId: "HX-011",
      commodity: "Soybean-MOI 4",
      quantityMt: 251.700,
      arrivalDate: "2026-02-20",
      usdInvoice: 128367,
      inrSale: 12887040,
      inrSaleDate: "2026-03-05",
      mtbFx: 90.17,
      mtmFx: 90.24,
      mtbInr: 142872,
      mtmInr: 142728,
    },
    {
      tradeId: "HX-012",
      commodity: "Soybean - Zaks 10",
      quantityMt: 230.000,
      arrivalDate: "2026-02-24",
      usdInvoice: 115000,
      inrSale: 11776000,
      inrSaleDate: "2026-03-09",
      mtbFx: 90.22,
      mtmFx: 90.32,
      mtbInr: 130554,
      mtmInr: 130422,
    },
    {
      tradeId: "HX-013",
      commodity: "Almonds - Capay",
      quantityMt: 20.412,
      arrivalDate: "2026-03-07",
      usdInvoice: 109053,
      inrSale: 11100000,
      inrSaleDate: "2026-03-17",
      mtbFx: 90.32,
      mtmFx: 90.42,
      mtbInr: 123060,
      mtmInr: 122936,
    },
  ];
}
