import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "./components/AppShell";
import { ThemeProvider } from "./components/ThemeProvider";

export const metadata: Metadata = {
  title: "HectarFX — FX Simulator & Hedge Platform",
  description: "Real-time FX exposure management, hedge simulation, and P&L tracking for Hectar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
