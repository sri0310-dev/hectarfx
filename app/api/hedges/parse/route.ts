import { NextResponse } from "next/server";

// Parse Kotak FXLive Deal Summary text format
// Example: "HECTAR INDIA TRADING PRIVATE LIMITED BOUGHT 80000.00 USD vs INR@90.6800 For 27-Feb-2026 (BROKEN) ( HECTAR INDIA TRADING PRIVATE LIMITED SOLD 7254400 INR )"
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body.text || "").trim();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Try Kotak FXLive format
    const kotakMatch = text.match(
      /(BOUGHT|SOLD)\s+([\d,.]+)\s+USD\s+vs\s+INR@([\d.]+)\s+For\s+([\d]+-[A-Za-z]+-[\d]+)/i
    );

    if (kotakMatch) {
      const direction = kotakMatch[1].toUpperCase() === "BOUGHT" ? "BUY_USD" : "SELL_USD";
      const usdAmount = parseFloat(kotakMatch[2].replace(/,/g, ""));
      const rate = parseFloat(kotakMatch[3]);
      const dateStr = kotakMatch[4]; // e.g., "27-Feb-2026"

      // Parse date
      const months: Record<string, string> = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      };
      const dateParts = dateStr.split("-");
      const settlementDate = `${dateParts[2]}-${months[dateParts[1]] || "01"}-${dateParts[0].padStart(2, "0")}`;

      // Extract ticket number if present
      const ticketMatch = text.match(/Ticket\s*(?:No)?[.:]?\s*(\d+)/i);
      const ticketNo = ticketMatch ? ticketMatch[1] : "";

      // Extract contract date
      const dateTimeMatch = text.match(/Date\/Time[.:]?\s*([\d]+-[A-Za-z]+-[\d]+)/i);
      let contractDate = new Date().toISOString().slice(0, 10);
      if (dateTimeMatch) {
        const dp = dateTimeMatch[1].split("-");
        contractDate = `${dp[2]}-${months[dp[1]] || "01"}-${dp[0].padStart(2, "0")}`;
      }

      // Extract type
      const typeMatch = text.match(/Type[.:]?\s*(FORWARD|OPTION|SWAP)/i);
      const type = typeMatch ? typeMatch[1].toUpperCase() : "FORWARD";

      return NextResponse.json({
        parsed: true,
        data: {
          direction,
          usdAmount,
          rate,
          inrAmount: usdAmount * rate,
          settlementDate,
          contractDate,
          ticketNo,
          type,
          bank: "Kotak",
          notes: `Parsed from deal summary text`,
        },
      });
    }

    // Try generic format: "80000 USD @ 90.68 expiry 2026-02-27"
    const genericMatch = text.match(
      /([\d,.]+)\s*(?:USD|usd)\s*@\s*([\d.]+)\s*(?:expiry|exp|settlement|for)?\s*([\d]{4}-[\d]{2}-[\d]{2})/i
    );

    if (genericMatch) {
      return NextResponse.json({
        parsed: true,
        data: {
          direction: "BUY_USD",
          usdAmount: parseFloat(genericMatch[1].replace(/,/g, "")),
          rate: parseFloat(genericMatch[2]),
          inrAmount: parseFloat(genericMatch[1].replace(/,/g, "")) * parseFloat(genericMatch[2]),
          settlementDate: genericMatch[3],
          contractDate: new Date().toISOString().slice(0, 10),
          ticketNo: "",
          type: "FORWARD",
          bank: "",
          notes: "Parsed from text input",
        },
      });
    }

    return NextResponse.json({
      parsed: false,
      error: "Could not parse the text. Expected Kotak FXLive format or: '80000 USD @ 90.68 expiry 2026-02-27'",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
