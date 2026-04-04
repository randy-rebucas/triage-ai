"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface NavbarProps {
  userName?: string;
  userRole?: string;
  tenantSlug?: string;
}

export function Navbar({ userName, userRole, tenantSlug }: NavbarProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const base = tenantSlug ? `/${tenantSlug}` : "";

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push(tenantSlug ? `/${tenantSlug}/login` : "/login");
      router.refresh();
    } catch {
      setIsLoading(false);
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

        {/* Navigation links */}
        <nav className="hidden items-center gap-6 md:flex">
          {userRole === "patient" && (
            <>
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
            </>
          )}
          {(userRole === "doctor" || userRole === "admin") && (
            <>
              <Link href={`${base}/doctor/dashboard`}
                className="text-sm font-medium text-gray-600 transition-colors hover:text-blue-600">
                Dashboard
              </Link>
              <Link href={`${base}/doctor/patients`}
                className="text-sm font-medium text-gray-600 transition-colors hover:text-blue-600">
                Patients
              </Link>
            </>
          )}
        </nav>

        {/* User section */}
        <div className="flex items-center gap-3">
          {userName && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-gray-900">{userName}</p>
              <p className="text-xs capitalize text-gray-500">{userRole}</p>
            </div>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {userName?.[0]?.toUpperCase() || "?"}
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} isLoading={isLoading}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
