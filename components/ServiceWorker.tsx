"use client";

import { useEffect } from "react";

// Registers a tiny service worker (public/sw.js). It exists so the app is
// installable and shows a friendly page when offline; it never caches data.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
