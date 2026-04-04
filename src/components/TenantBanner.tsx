"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTenant } from "@/context/TenantContext";

// ─────────────────────────────────────────────────────────────────
// TenantBanner — improved
//
// Two-row layout:
//   Row 1 (main bar):  logo · clinic name · address · [Switch Clinic]
//   Row 2 (sub-bar):   subscription status details (plan, expiry)
//
// Collapsed to a single row on expired / inactive subscriptions
// with a prominent warning accent.
// ─────────────────────────────────────────────────────────────────

type SubPillVariant = "active" | "trial" | "expiring" | "expired" | "inactive";

function resolveVariant(
  isActive: boolean,
  isTrial: boolean,
  isExpired: boolean,
  daysRemaining: number | null
): SubPillVariant {
  if (isExpired)                                   return "expired";
  if (!isActive)                                   return "inactive";
  if (isTrial)                                     return "trial";
  if (daysRemaining !== null && daysRemaining <= 7) return "expiring";
  return "active";
}

const VARIANT_PILL: Record<SubPillVariant, string> = {
  active:   "bg-emerald-400/20 text-emerald-100 border border-emerald-400/30",
  trial:    "bg-sky-400/20     text-sky-100     border border-sky-400/30",
  expiring: "bg-amber-400/20   text-amber-100   border border-amber-400/30",
  expired:  "bg-rose-400/20    text-rose-200    border border-rose-400/30",
  inactive: "bg-rose-400/20    text-rose-200    border border-rose-400/30",
};

const VARIANT_DOT: Record<SubPillVariant, string> = {
  active:   "bg-emerald-400",
  trial:    "bg-sky-400",
  expiring: "bg-amber-400 animate-pulse",
  expired:  "bg-rose-400",
  inactive: "bg-rose-400",
};

const VARIANT_LABEL: Record<SubPillVariant, (days: number | null, plan: string | null) => string> = {
  active:   (d, p)   => `${p ? p.charAt(0).toUpperCase() + p.slice(1) : "Active"}${d ? ` · ${d}d left` : ""}`,
  trial:    (d, _p)  => `Free Trial${d !== null ? ` · ${d}d left` : ""}`,
  expiring: (d, _p)  => `Renew soon · ${d}d left`,
  expired:  (_d, _p) => "Subscription Expired",
  inactive: (_d, _p) => "Subscription Inactive",
};

function StatusPill({
  isActive, isTrial, isExpired, status, daysRemaining, plan,
}: {
  isActive: boolean; isTrial: boolean; isExpired: boolean;
  status: string | null; daysRemaining: number | null; plan: string | null;
}) {
  const variant = resolveVariant(isActive, isTrial, isExpired, daysRemaining);
  const label   = VARIANT_LABEL[variant](daysRemaining, plan);

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${VARIANT_PILL[variant]}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${VARIANT_DOT[variant]}`} />
      {label}
    </span>
  );
}

function SwitchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 flex-shrink-0 opacity-70" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export default function TenantBanner() {
  const tenant = useTenant();
  const router = useRouter();

  const label   = tenant.displayName || tenant.name;
  const address = [tenant.city, tenant.state, tenant.country].filter(Boolean).join(", ");
  const sub     = tenant.subscription;

  const isWarning = sub
    ? sub.isExpired || !sub.isActive ||
      (sub.daysRemaining !== null && sub.daysRemaining <= 7)
    : false;

  function handleSwitch() {
    document.cookie = `tenant_v_${tenant.subdomain}=; path=/; max-age=0; SameSite=Lax`;
    router.push("/");
  }

  return (
    <div className={`w-full text-white shadow-sm ${
      isWarning
        ? "bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600"
        : "bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600"
    }`}>

      {/* ── Main row ───────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">

        {/* Left: avatar + clinic info */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo / avatar */}
          <div className="flex-shrink-0 relative">
            {tenant.logo ? (
              <Image
                src={tenant.logo}
                alt={`${label} logo`}
                width={36}
                height={36}
                className="rounded-xl object-cover ring-2 ring-white/25"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-white/20 ring-2 ring-white/25 flex items-center justify-center font-bold text-base">
                {label.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Online indicator */}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-white/30" />
          </div>

          {/* Name + address */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Triage AI
              </span>
              <span className="text-white/40 text-xs">·</span>
              <span className="text-sm font-semibold truncate">{label}</span>
              <span className="hidden md:inline-flex text-xs text-white/50 bg-white/10 px-1.5 py-0.5 rounded font-mono">
                {tenant.subdomain}
              </span>
            </div>
            {address && (
              <div className="flex items-center gap-1 mt-0.5">
                <LocationIcon />
                <span className="text-xs text-white/70 truncate">{address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: status pill + switch button */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {sub && (
            <span className="hidden sm:inline-flex">
              <StatusPill
                isActive={sub.isActive}
                isTrial={sub.isTrial}
                isExpired={sub.isExpired}
                status={sub.status}
                daysRemaining={sub.daysRemaining}
                plan={sub.plan}
              />
            </span>
          )}

          <button
            onClick={handleSwitch}
            title="Switch to a different clinic"
            className="inline-flex items-center gap-1.5 text-xs font-semibold
              bg-white/10 hover:bg-white/20 active:bg-white/30
              border border-white/20 hover:border-white/40
              px-3 py-1.5 rounded-lg transition-all duration-150"
          >
            <SwitchIcon />
            <span className="hidden sm:inline">Switch Clinic</span>
            <span className="sm:hidden">Switch</span>
          </button>
        </div>
      </div>

      {/* ── Warning sub-bar (expired / expiring soon) ──────────── */}
      {isWarning && sub && (
        <div className="bg-black/20 border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 flex-shrink-0 text-amber-300"
              viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd"
                d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                clipRule="evenodd" />
            </svg>
            <p className="text-xs text-amber-100">
              {sub.isExpired
                ? "This clinic's subscription has expired. Some features may be unavailable. Please contact your administrator."
                : `This clinic's subscription expires in ${sub.daysRemaining} day${sub.daysRemaining === 1 ? "" : "s"}. Please renew to avoid service interruption.`
              }
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
