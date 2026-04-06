"use client";

import { createContext, useContext } from "react";
import type { TenantCachePayload, TenantSubscription } from "@/components/TenantCookieSetter";

// ─────────────────────────────────────────────────────────────────
// TenantContext
//
// Holds the full validated tenant data for the current /{slug}/*
// session. Populated once in the root layout after validation and
// available to every client component beneath it — no extra API
// calls needed.
//
// Usage:
//   import { useTenant } from "@/context/TenantContext";
//   const tenant = useTenant();
//   tenant.subscription.isActive   // subscription gate
//   tenant.logo                    // clinic logo URL
//   tenant.city                    // address
// ─────────────────────────────────────────────────────────────────

export type { TenantCachePayload, TenantSubscription };

const TenantContext = createContext<TenantCachePayload | null>(null);

interface ProviderProps {
  value:    TenantCachePayload;
  children: React.ReactNode;
}

/**
 * Wrap all /{tenant}/* pages with this provider (done in the root layout).
 * The value is the full payload read from the cookie or freshly fetched.
 */
export function TenantProvider({ value, children }: ProviderProps) {
  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

/**
 * Read the current tenant's data from any client component.
 * Throws if used outside a TenantProvider.
 */
export function useTenant(): TenantCachePayload {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error(
      "useTenant() must be used inside a <TenantProvider>. " +
      "Ensure the component is rendered under a /{tenant}/* route."
    );
  }
  return ctx;
}

