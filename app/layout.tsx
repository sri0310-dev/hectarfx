import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./components/Sidebar";
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
          <div className="flex min-h-screen">
            <Sidebar />
            {/* Desktop: margin-left for sidebar. Mobile: no margin, padding-bottom for bottom nav */}
            <main className="flex-1 md:ml-64 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
