"use client";

import { useEffect } from "react";

// ─────────────────────────────────────────────────────────────────
// TenantCookieSetter
//
// Invisible client component that persists the full tenant
// validation result to a cookie after the first successful render.
//
// Cookie name : tenant_v_{slug}
// Cookie value: base64(JSON(TenantCachePayload))
//
// Server layout reads this cookie on every request.
// Cache hit  → skip the API call entirely.
// Cache miss → call /api/tenants/validate, re-set cookie.
// ─────────────────────────────────────────────────────────────────

export interface TenantSubscription {
  plan:          string | null;
  status:        string | null;
  billingCycle:  string | null;
  isActive:      boolean;
  isTrial:       boolean;
  isExpired:     boolean;
  expiresAt:     string | null;
  daysRemaining: number | null;
}

export interface TenantCachePayload {
  valid:        true;
  exp:          number;          // Unix ms — TTL tracked client-side too
  tenantId:     string;
  name:         string;
  displayName:  string;
  subdomain:    string;
  logo:         string | null;
  city:         string | null;
  state:        string | null;
  country:      string | null;
  subscription: TenantSubscription;
}

interface Props {
  payload:     TenantCachePayload;
  ttlSeconds?: number;           // default: 600 s (10 min)
}

export default function TenantCookieSetter({ payload, ttlSeconds = 600 }: Props) {
  useEffect(() => {
    const value  = btoa(JSON.stringify(payload));
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `tenant_v_${payload.subdomain}=${value}; path=/; max-age=${ttlSeconds}; SameSite=Lax${secure}`;
  }, [payload, ttlSeconds]);

  return null;
}
