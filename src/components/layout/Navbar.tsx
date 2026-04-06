"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface NavbarProps {
  userName?:   string;
  tenantSlug?: string;
}

const NAV_LINKS = [
  { href: "/patient/dashboard",  label: "Dashboard"        },
  { href: "/patient/triage",     label: "Start Assessment" },
  { href: "/patient/reports",    label: "My Reports"       },
];

export function Navbar({ userName, tenantSlug }: NavbarProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const [busy,        setBusy]        = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [dropOpen,    setDropOpen]    = useState(false);
  const [mounted,     setMounted]     = useState(false);

  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropOpen) return;
    function onOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [dropOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!dropOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDropOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dropOpen]);

  const base = tenantSlug ? `/${tenantSlug}` : "";

  const handleLogout = async () => {
    setBusy(true);
    setDropOpen(false);
    try {
      await fetch("/api/patients/session", { method: "DELETE" });
    } finally {
      router.push(tenantSlug ? `/${tenantSlug}/login` : "/");
      router.refresh();
    }
  };

  const isActive = (suffix: string) => mounted && pathname.startsWith(`${base}${suffix}`);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

        {/* Logo */}
        <Link href={base || "/"} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-sm font-bold text-white">TA</span>
          </div>
          <span className="hidden font-bold text-gray-900 sm:block">Triage AI</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={`${base}${href}`}
              className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                isActive(href) ? "text-blue-600" : "text-gray-600"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">

          {/* Avatar dropdown */}
          <div ref={dropRef} className="relative">
            <button
              type="button"
              onClick={() => setDropOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={dropOpen}
              aria-label="Account menu"
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              {userName && (
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium text-gray-900 leading-tight">{userName}</p>
                  <p className="text-xs text-gray-500">Patient</p>
                </div>
              )}
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                {userName?.[0]?.toUpperCase() || "?"}
              </div>
              {/* Chevron */}
              <svg
                className={`hidden h-3.5 w-3.5 text-gray-400 transition-transform duration-150 sm:block ${dropOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Dropdown panel */}
            {dropOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-52 origin-top-right rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg ring-1 ring-black/5 animate-fade-in"
              >
                {/* User info header */}
                {userName && (
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-900 truncate">{userName}</p>
                    <p className="text-xs text-gray-500">Patient account</p>
                  </div>
                )}

                <Link
                  href={`${base}/patient/profile`}
                  role="menuitem"
                  onClick={() => setDropOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  My Profile
                </Link>

                <div className="my-1 border-t border-gray-100" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  disabled={busy}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {busy ? (
                    <svg className="h-4 w-4 animate-spin text-red-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                    </svg>
                  )}
                  {busy ? "Signing out…" : "Sign out"}
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex items-center justify-center rounded-lg min-h-[44px] min-w-[44px] text-gray-600 hover:bg-gray-100 md:hidden"
          >
            {menuOpen ? (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-gray-100 bg-white md:hidden">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={`${base}${href}`}
                onClick={() => setMenuOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(href)
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </Link>
            ))}
            <Link
              href={`${base}/patient/profile`}
              onClick={() => setMenuOpen(false)}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive("/patient/profile")
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              My Profile
            </Link>
          </nav>
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              isLoading={busy}
              className="w-full justify-center text-red-600 hover:bg-red-50"
            >
              Sign out
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
