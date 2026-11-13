"use client";

import { ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

// If the session expires while a tab is open, API calls start returning 401.
// Send the user back to the login page instead of letting pages render bad data.
// Responses are passed through unchanged; this only adds a redirect on 401.
function installSessionExpiryRedirect() {
  const w = window as typeof window & { __hfxFetchPatched?: boolean };
  if (w.__hfxFetchPatched) return;
  w.__hfxFetchPatched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await originalFetch(input, init);
    try {
      if (res.status === 401 && window.location.pathname !== "/login") {
        const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, window.location.origin);
        if (
          url.origin === window.location.origin &&
          url.pathname.startsWith("/api/") &&
          !url.pathname.startsWith("/api/auth/")
        ) {
          const next = window.location.pathname + window.location.search;
          window.location.href = `/login?next=${encodeURIComponent(next)}`;
        }
      }
    } catch {
      /* never interfere with the original response */
    }
    return res;
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    installSessionExpiryRedirect();
  }, []);

  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* Desktop: margin-left for sidebar. Mobile: no margin, padding-bottom for bottom nav */}
      <main className="flex-1 md:ml-64 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
