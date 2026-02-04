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
  const range = process.env.SHEET_RANGE || "Sheet1!A1:K1000";

  if (!sheetId) {
    // Return demo data when no sheet is configured
    return getDemoTrades();
  }

  const rows = await readSheetValues(sheetId, range);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => String(h).trim().toLowerCase());
  const data = rows.slice(1);

  const findCol = (keywords: string[]) =>
    headers.findIndex((h) => keywords.some((k) => h.includes(k)));

  const iTradeId = findCol(["tradeid", "trade id", "trade_id", "id"]);
  const iCommodity = findCol(["commodity", "product", "item"]);
  const iUsd = findCol(["usd", "purchase invoice", "invoice value"]);
  const iInr = findCol(["inr sale", "inr_sale", "inr sales"]);
  const iSaleDate = findCol(["sale date", "inr sales date", "receipt date", "saledate"]);
  const iMtb = findCol(["marked to book", "mtb", "book rate"]);
  const iMtm = findCol(["marked to market", "mtm", "market rate"]);
  const iNotes = findCol(["notes", "remark"]);

  return data
    .map((r, idx) => ({
      tradeId: iTradeId >= 0 ? String(r[iTradeId] ?? "").trim() : `T${idx + 1}`,
      commodity: iCommodity >= 0 ? String(r[iCommodity] ?? "").trim() : "",
      usdInvoice: toNumber(iUsd >= 0 ? r[iUsd] : 0),
      inrSale: toNumber(iInr >= 0 ? r[iInr] : 0),
      inrSaleDate: iSaleDate >= 0 ? parseDate(r[iSaleDate]) : "",
      mtbFx: toNumber(iMtb >= 0 ? r[iMtb] : 0),
      mtmFx: toNumber(iMtm >= 0 ? r[iMtm] : 0),
      notes: iNotes >= 0 ? String(r[iNotes] ?? "").trim() : "",
    }))
    .filter((t) => t.usdInvoice > 0);
}

// Demo trades for when Google Sheets isn't configured
export function getDemoTrades(): Trade[] {
  return [
    {
      tradeId: "HX-2026-001",
      commodity: "Cashew W320",
      usdInvoice: 125000,
      inrSale: 10937500,
      inrSaleDate: "2026-03-15",
      mtbFx: 87.50,
      mtmFx: 86.20,
      notes: "Vietnam origin",
    },
    {
      tradeId: "HX-2026-002",
      commodity: "Cashew W240",
      usdInvoice: 89000,
      inrSale: 7832000,
      inrSaleDate: "2026-03-28",
      mtbFx: 88.00,
      mtmFx: 86.20,
      notes: "Tanzania origin",
    },
    {
      tradeId: "HX-2026-003",
      commodity: "Cashew SW320",
      usdInvoice: 210000,
      inrSale: 18270000,
      inrSaleDate: "2026-04-10",
      mtbFx: 87.00,
      mtmFx: 86.20,
      notes: "Ivory Coast origin",
    },
    {
      tradeId: "HX-2026-004",
      commodity: "Cashew W180",
      usdInvoice: 175000,
      inrSale: 15575000,
      inrSaleDate: "2026-04-25",
      mtbFx: 89.00,
      mtmFx: 86.20,
      notes: "India domestic",
    },
    {
      tradeId: "HX-2026-005",
      commodity: "Cashew W320",
      usdInvoice: 95000,
      inrSale: 8265000,
      inrSaleDate: "2026-05-12",
      mtbFx: 87.00,
      mtmFx: 86.20,
      notes: "Vietnam origin",
    },
    {
      tradeId: "HX-2026-006",
      commodity: "Sesame Seeds",
      usdInvoice: 67000,
      inrSale: 5896000,
      inrSaleDate: "2026-03-20",
      mtbFx: 88.00,
      mtmFx: 86.20,
    },
    {
      tradeId: "HX-2026-007",
      commodity: "Cashew W450",
      usdInvoice: 142000,
      inrSale: 12354000,
      inrSaleDate: "2026-05-30",
      mtbFx: 87.00,
      mtmFx: 86.20,
      notes: "Guinea Bissau origin",
    },
    {
      tradeId: "HX-2026-008",
      commodity: "Cashew W320",
      usdInvoice: 58000,
      inrSale: 5046000,
      inrSaleDate: "2026-06-15",
      mtbFx: 87.00,
      mtmFx: 86.20,
      notes: "Benin origin",
    },
  ];
}
