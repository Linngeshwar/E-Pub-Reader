"use client";

import { useServiceWorker } from "@/lib/use-service-worker";

export function ServiceWorkerRegistrar() {
  useServiceWorker();
  return null;
}
