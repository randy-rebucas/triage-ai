"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface NavbarProps {
  userName?:   string;
  tenantSlug?: string;
}

export function Navbar({ userName, tenantSlug }: NavbarProps) {
  const router     = useRouter();
  const [busy, setBusy] = useState(false);

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

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href={base || "/"} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-sm font-bold text-white">CA</span>
          </div>
          <span className="hidden font-bold text-gray-900 sm:block">ClinicAI</span>
        </Link>

        {/* Patient navigation */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link href={`${base}/patient/dashboard`}
            className="text-sm font-medium text-gray-600 transition-colors hover:text-blue-600">
            Dashboard
          </Link>
          <Link href={`${base}/patient/triage`}
            className="text-sm font-medium text-gray-600 transition-colors hover:text-blue-600">
            Start Assessment
          </Link>
          <Link href={`${base}/patient/reports`}
            className="text-sm font-medium text-gray-600 transition-colors hover:text-blue-600">
            My Reports
          </Link>
        </nav>

        {/* User section */}
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
          <Button variant="ghost" size="sm" onClick={handleLogout} isLoading={busy}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
