"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────────────────────────
// Root Page — Clinic Directory Picker
//
// Users select a clinic to enter, or register a new one.
// Calls GET /api/tenants/directory for live search.
// ─────────────────────────────────────────────────────────────────

interface Clinic {
  id: string;
  name: string;
  displayName: string;
  subdomain: string;
  city: string | null;
  state: string | null;
  country: string | null;
  logo: string | null;
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  const fetchClinics = useCallback(async (search: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/tenants/directory?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error("Failed to load clinics");
      setClinics(data.data);
      setTotal(data.pagination?.total ?? data.data.length);
    } catch {
      setError("Unable to load clinics. Please try again.");
      setClinics([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClinics(debouncedQuery);
  }, [debouncedQuery, fetchClinics]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10 px-4 sm:px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
              <span className="font-bold text-white text-sm">TA</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Triage AI</span>
          </div>
          <Link
            href="https://www.myclinicsoft.solutions/tenant-onboard" target="_blank"
            className="inline-flex items-center min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Register your clinic →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero text */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            Find your clinic
          </h1>
          <p className="mt-3 text-lg text-gray-500">
            Select your clinic below to sign in or start your assessment.
          </p>
        </div>

        {/* Search bar */}
        <div className="relative mb-8">
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by clinic name or city..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 py-4 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all text-lg"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute inset-y-0 right-2 sm:right-4 flex items-center justify-center min-h-[44px] min-w-[44px] text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Results */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : clinics.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-5xl mb-4">🏥</p>
            <p className="font-semibold text-gray-900 text-lg">
              {query ? "No clinics match your search" : "No clinics registered yet"}
            </p>
            <p className="text-gray-500 mt-2 text-sm">
              {query ? "Try a different name or city." : "Be the first to register your clinic."}
            </p>
            <Link
              href="/onboard"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Register your clinic →
            </Link>
          </div>
        ) : (
          <>
            {!query && (
              <p className="text-sm text-gray-400 mb-4">
                {total} clinic{total !== 1 ? "s" : ""} available
              </p>
            )}
            {query && (
              <p className="text-sm text-gray-400 mb-4">
                {clinics.length} result{clinics.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {clinics.map((clinic) => (
                <ClinicCard
                  key={clinic.id}
                  clinic={clinic}
                  onClick={() => router.push(`/${clinic.subdomain}`)}
                />
              ))}
            </div>
          </>
        )}

        {/* Register CTA (bottom) */}
        <div className="mt-10 sm:mt-12 rounded-2xl border border-dashed border-gray-300 bg-white p-6 sm:p-8 text-center">
          <p className="font-semibold text-gray-900">Not seeing your clinic?</p>
          <p className="text-sm text-gray-500 mt-1 mb-5">
            Register your clinic and start your free trial today.
          </p>
          <Link
            href="https://www.myclinicsoft.solutions/tenant-onboard" target="_blank"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Register a Clinic →
          </Link>
        </div>
      </main>
    </div>
  );
}

function ClinicCard({
  clinic,
  onClick,
}: {
  clinic: Clinic;
  onClick: () => void;
}) {
  const initials = clinic.displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const location = [clinic.city, clinic.state, clinic.country]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      onClick={onClick}
      className="group w-full rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-4">
        {clinic.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clinic.logo}
            alt={clinic.displayName}
            className="h-12 w-12 rounded-xl object-cover flex-shrink-0"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold text-sm flex-shrink-0">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
            {clinic.displayName}
          </p>
          {location && (
            <p className="text-sm text-gray-500 truncate mt-0.5">{location}</p>
          )}
          <p className="text-xs text-gray-400 font-mono mt-1">{clinic.subdomain}</p>
        </div>
        <svg
          className="h-5 w-5 text-gray-300 group-hover:text-blue-400 transition-colors flex-shrink-0"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
