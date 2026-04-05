"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { useTenant } from "@/context/TenantContext";

// ─────────────────────────────────────────────────────────────────
// Tenant Register Page — /{tenant}/register
// Patient self-registration via local proxy → external patient API
// ─────────────────────────────────────────────────────────────────

const SEX_MAP: Record<string, "male" | "female" | "other"> = {
  male: "male", female: "female", other: "other", prefer_not_to_say: "other",
};

export default function RegisterPage() {
  const router        = useRouter();
  const params        = useParams<{ tenant: string }>();
  const tenant        = params.tenant;
  const { tenantId }  = useTenant();

  const [step, setStep]     = useState(1);
  const [form, setForm]     = useState({
    name:           "",
    email:          "",
    password:       "",
    confirmPassword:"",
    dateOfBirth:    "",
    gender:         "",
    contactNumber:  "",
  });
  const [error, setError]       = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { setError("Passwords do not match"); return; }
    if (form.password.length < 8)               { setError("Password must be at least 8 characters"); return; }
    setError(null);
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const nameParts = form.name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? "";
      const lastName  = nameParts.length > 1 ? nameParts.slice(1).join(" ") : firstName;

      const res = await fetch("/api/patients/public", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          firstName,
          lastName,
          email:       form.email        || undefined,
          phone:       form.contactNumber || undefined,
          dateOfBirth: form.dateOfBirth   || undefined,
          sex:         SEX_MAP[form.gender] ?? "other",
          tenantId:    tenantId           ?? undefined,
          address:     { street: "", city: "", state: "", zipCode: "" },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      // Public registration does not issue a session — redirect to login
      router.push(`/${tenant}/login`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-blue-600 font-medium">{tenant}</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className={`h-2 w-8 rounded-full ${step >= 1 ? "bg-blue-500" : "bg-gray-200"}`} />
            <div className={`h-2 w-8 rounded-full ${step >= 2 ? "bg-blue-500" : "bg-gray-200"}`} />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Step {step} of 2: {step === 1 ? "Account Details" : "Personal Info"}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {error && <Alert variant="error" className="mb-6">{error}</Alert>}

          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-5">
              <Input label="Full Name" placeholder="Juan dela Cruz"
                value={form.name} onChange={set("name")} required />
              <Input label="Email address" type="email" placeholder="you@example.com"
                value={form.email} onChange={set("email")} required />
              <Input label="Password" type="password" placeholder="Min. 8 characters"
                value={form.password} onChange={set("password")}
                hint="Must contain uppercase, lowercase, and a number" required />
              <Input label="Confirm Password" type="password" placeholder="Repeat your password"
                value={form.confirmPassword} onChange={set("confirmPassword")} required />
              <Button type="submit" className="w-full" size="lg">Continue →</Button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input label="Date of Birth" type="date"
                value={form.dateOfBirth} onChange={set("dateOfBirth")} required />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gender <span className="text-red-500">*</span>
                </label>
                <select value={form.gender} onChange={set("gender")} required
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <Input label="Contact Number" type="tel" placeholder="+63 9XX XXX XXXX"
                value={form.contactNumber} onChange={set("contactNumber")} />
              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setStep(1)} className="flex-1">← Back</Button>
                <Button type="submit" isLoading={isLoading} className="flex-1">Create Account</Button>
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href={`/${tenant}/login`} className="font-medium text-blue-600 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
