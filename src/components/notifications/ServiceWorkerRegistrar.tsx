"use client";

import { useEffect } from "react";

/** Registers the push-only service worker. Renders nothing; no-op where unsupported. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
