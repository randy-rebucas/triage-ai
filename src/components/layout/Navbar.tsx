"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const router       = useRouter();
  const pathname     = usePathname();
  const [busy, setBusy]         = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted]   = useState(false);

  // Defer active-link detection to after hydration to prevent SSR mismatch
  useEffect(() => { setMounted(true); }, []);

  const base = tenantSlug ? `/${tenantSlug}` : "";

  const handleLogout = async () => {
    setBusy(true);
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
        <div className="flex items-center gap-3">
          {userName && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-gray-900">{userName}</p>
              <p className="text-xs text-gray-500">Patient</p>
            </div>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {userName?.[0]?.toUpperCase() || "?"}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            isLoading={busy}
            className="hidden md:inline-flex"
          >
            Sign out
          </Button>

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
          </nav>
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              isLoading={busy}
              className="w-full justify-center"
            >
              Sign out
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
