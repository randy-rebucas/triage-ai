"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// ─────────────────────────────────────────────────────────────────
// Onboarding Page — self-service clinic registration
//
// Calls the LOCAL /api/tenants/onboard which:
//   1. Creates Tenant + admin User + Settings in the local MongoDB
//      (required for staff login, triage, and clinical records)
//   2. Also registers the clinic with the external myclinicsoft API
//      (for the global tenant directory and patient portal)
// ─────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  subdomain: string;
  displayName: string;
  email: string;
  phone: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  timezone: string;
  currency: string;
}

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ subdomain: string; plan: string } | null>(null);

  const [form, setForm] = useState<FormState>({
    name: "",
    subdomain: "",
    displayName: "",
    email: "",
    phone: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    timezone: "UTC",
    currency: "PHP",
  });

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Auto-generate subdomain from clinic name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setForm((f) => ({
      ...f,
      name,
      subdomain: f.subdomain ||
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/tenants/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        form.name,
          subdomain:   form.subdomain,
          displayName: form.displayName  || undefined,
          email:       form.email        || undefined,
          phone:       form.phone        || undefined,
          settings:    { timezone: form.timezone, currency: form.currency },
          admin: {
            name:     form.adminName,
            email:    form.adminEmail,
            password: form.adminPassword,
          },
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Registration failed. Please try again.");
        return;
      }

      setSuccess({ subdomain: json.data.subdomain, plan: json.data.subscription.plan });
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto mb-6 flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Clinic Registered!</h1>
          <p className="text-gray-500 mb-6">
            Your <strong>{success.plan}</strong> trial is active for 7 days.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-gray-500">Your clinic URL:</p>
            <p className="font-mono font-medium text-brand-700">
              /
              {success.subdomain}
              /login
            </p>
          </div>
          <button
            onClick={() => router.push(`/${success.subdomain}/login`)}
            className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg transition-colors"
          >
            Sign In to Your Clinic
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4 py-12">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-xl mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Register Your Clinic</h1>
          <p className="mt-2 text-gray-500">Start your 7-day free trial — no credit card required</p>
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-3 mb-8">
          {([1, 2] as const).map((s) => (
            <button
              key={s}
              onClick={() => step >= s && setStep(s)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors
                ${step === s ? "bg-brand-600 text-white" : step > s ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}
            >
              {step > s ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span>{s}</span>
              )}
              {s === 1 ? "Clinic Info" : "Admin Account"}
            </button>
          ))}
        </div>

        <form onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2); } : handleSubmit}
          className="bg-white rounded-2xl shadow-xl p-8 space-y-5">

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Clinic Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={handleNameChange}
                  required
                  placeholder="Sunshine Medical Clinic"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subdomain <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent">
                  <input
                    type="text"
                    value={form.subdomain}
                    onChange={set("subdomain")}
                    required
                    placeholder="sunshine"
                    className="flex-1 px-4 py-2.5 outline-none"
                  />
                  <span className="px-3 py-2.5 bg-gray-50 border-l border-gray-300 text-gray-500 text-sm whitespace-nowrap">
                    .myclinicsoft.com
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">Lowercase letters, numbers, hyphens only</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    placeholder="clinic@example.com"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    placeholder="+63 912 345 6789"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select
                    value={form.timezone}
                    onChange={set("timezone")}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none bg-white"
                  >
                    <option value="UTC">UTC</option>
                    <option value="Asia/Manila">Asia/Manila (PH)</option>
                    <option value="America/New_York">Eastern (US)</option>
                    <option value="America/Los_Angeles">Pacific (US)</option>
                    <option value="Europe/London">London (UK)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={form.currency}
                    onChange={set("currency")}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none bg-white"
                  >
                    <option value="PHP">PHP — Philippine Peso</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.adminName}
                  onChange={set("adminName")}
                  required
                  placeholder="Dr. Maria Santos"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={set("adminEmail")}
                  required
                  placeholder="admin@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={form.adminPassword}
                  onChange={set("adminPassword")}
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                />
              </div>

              <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 text-sm text-brand-700">
                <strong>Your 7-day trial includes:</strong>
                <ul className="mt-2 space-y-1 list-disc list-inside text-brand-600">
                  <li>Unlimited AI triage sessions</li>
                  <li>Up to 50 patient records</li>
                  <li>Doctor dashboard and validation tools</li>
                  <li>Full audit logging (PH DPA compliant)</li>
                </ul>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-semibold rounded-lg transition-colors"
            >
              {isLoading ? "Creating…" : step === 1 ? "Continue" : "Create Clinic"}
            </button>
          </div>

          <p className="text-center text-sm text-gray-500">
            Already have a clinic?{" "}
            <a href={`/${form.subdomain}/login`} className="text-brand-600 font-medium hover:underline">
              Sign in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
