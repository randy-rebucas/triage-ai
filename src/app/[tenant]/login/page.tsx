"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

// ─────────────────────────────────────────────────────────────────
// Tenant Login Page — /{tenant}/login
// Posts tenantSlug to the login API so it scopes to the right tenant
// ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const tenant = params.tenant;

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tenantSlug: tenant }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      const role = data.data.user.role;
      router.push(
        role === "patient"
          ? `/${tenant}/patient/profile`
          : `/${tenant}/doctor/dashboard`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
              <span className="font-bold text-white text-lg">CA</span>
            </div>
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Sign in to ClinicAI</h1>
          <p className="mt-1 text-sm text-blue-600 font-medium">{tenant}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {error && <Alert variant="error" className="mb-6">{error}</Alert>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              autoComplete="current-password"
            />

            <Button type="submit" isLoading={isLoading} className="w-full" size="lg">
              Sign In
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href={`/${tenant}/register`} className="font-medium text-blue-600 hover:underline">
              Create one
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Protected by 256-bit encryption. Your health data is safe.
        </p>
      </div>
    </div>
  );
}
