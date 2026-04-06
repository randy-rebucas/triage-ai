"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { useTenant } from "@/context/TenantContext";
// ─────────────────────────────────────────────────────────────────
// Tenant Login Page — /{tenant}/login
//
// Three authentication methods backed by the external patient API:
//   Tab 1 — Email + password   → POST /api/patients/auth/login
//   Tab 2 — Phone OTP          → POST /api/patients/auth/otp/request
//                                POST /api/patients/auth/otp/verify
//   Tab 3 — QR code            → POST /api/patients/qr-login
//
// All calls go to LOCAL proxy routes (browser → localhost → external),
// which avoids CORS and lets the proxy re-scope the patient_session
// cookie to the local domain.
// tenantId comes from TenantContext (resolved in the layout).
// ─────────────────────────────────────────────────────────────────

const apiPost = (path: string, body: unknown) =>
  fetch(path, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

type Tab = "password" | "otp" | "qr";

const TABS: { id: Tab; label: string }[] = [
  { id: "password", label: "Password" },
  { id: "otp",      label: "Phone OTP" },
  { id: "qr",       label: "QR Code" },
];

export default function LoginPage() {
  const router          = useRouter();
  const params          = useParams<{ tenant: string }>();
  const tenant          = params.tenant;
  const { tenantId }    = useTenant();

  const [activeTab, setActiveTab] = useState<Tab>("password");

  // ── Tab 1 — Password ─────────────────────────────────────────
  const [pwForm,    setPwForm]    = useState({ email: "", password: "" });
  const [pwError,   setPwError]   = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  // ── Tab 2 — Phone OTP ────────────────────────────────────────
  const [otpStep,    setOtpStep]    = useState<"phone" | "code">("phone");
  const [phone,      setPhone]      = useState("");
  const [otpCode,    setOtpCode]    = useState("");
  const [otpError,   setOtpError]   = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [countdown,  setCountdown]  = useState(0);

  // ── Tab 3 — QR Code ──────────────────────────────────────────
  const [qrCode,    setQrCode]    = useState("");
  const [qrError,   setQrError]   = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // ── Resend countdown ─────────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const redirectAfterLogin = useCallback(() => {
    router.push(`/${tenant}/patient/dashboard`);
    router.refresh();
  }, [router, tenant]);

  // ── Tab 1: submit ────────────────────────────────────────────
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwLoading(true);
    setPwError(null);

    try {
      const res  = await apiPost("/api/patients/auth/login", { ...pwForm, tenantId });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "NO_PASSWORD") {
          setPwError(
            "This account has no password set. " +
            "Please use the Phone OTP or QR Code tab to sign in."
          );
        } else {
          setPwError(data.error || "Login failed");
        }
        return;
      }

      redirectAfterLogin();
    } catch {
      setPwError("An unexpected error occurred. Please try again.");
    } finally {
      setPwLoading(false);
    }
  };

  // ── Tab 2: request OTP (also used for resend) ────────────────
  const requestOtp = async () => {
    setOtpLoading(true);
    setOtpError(null);

    try {
      const res  = await apiPost("/api/patients/auth/otp/request", { phone, tenantId });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to send OTP");

      setOtpStep("code");
      setOtpCode("");
      setCountdown(60);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    requestOtp();
  };

  // ── Tab 2: verify OTP ────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError(null);

    try {
      const res  = await apiPost("/api/patients/auth/otp/verify", { phone, otp: otpCode, tenantId });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "OTP verification failed");

      redirectAfterLogin();
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Tab 3: QR login ──────────────────────────────────────────
  const handleQrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQrLoading(true);
    setQrError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(qrCode.trim());
    } catch {
      setQrError("Invalid QR code format — paste the full JSON text from your QR card.");
      setQrLoading(false);
      return;
    }

    try {
      const res  = await apiPost("/api/patients/qr-login", { qrCode: parsed, tenantId });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "QR login failed");

      redirectAfterLogin();
    } catch (err) {
      setQrError(err instanceof Error ? err.message : "QR login failed");
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-white px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo + heading */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
              <span className="font-bold text-white text-lg">TA</span>
            </div>
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Sign in to Triage AI</h1>
          <p className="mt-1 text-sm text-blue-600 font-medium capitalize">{tenant}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex-1 py-3 sm:py-3.5 text-xs sm:text-sm font-medium transition-colors min-h-[44px]",
                  activeTab === tab.id
                    ? "border-b-2 border-blue-600 text-blue-600 bg-blue-50/40"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5 sm:p-8">

            {/* ─────────── Tab 1 — Password ─────────── */}
            {activeTab === "password" && (
              <>
                {pwError && <Alert variant="error" className="mb-6">{pwError}</Alert>}
                <form onSubmit={handlePasswordSubmit} className="space-y-5">
                  <Input
                    label="Email address"
                    type="email"
                    placeholder="you@example.com"
                    value={pwForm.email}
                    onChange={(e) => setPwForm((f) => ({ ...f, email: e.target.value }))}
                    required
                    autoComplete="email"
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={pwForm.password}
                    onChange={(e) => setPwForm((f) => ({ ...f, password: e.target.value }))}
                    required
                    autoComplete="current-password"
                  />
                  <Button type="submit" isLoading={pwLoading} className="w-full" size="lg">
                    Sign In
                  </Button>
                </form>
              </>
            )}

            {/* ─────────── Tab 2 — Phone OTP ─────────── */}
            {activeTab === "otp" && (
              <>
                {otpError && <Alert variant="error" className="mb-6">{otpError}</Alert>}

                {otpStep === "phone" ? (
                  <form onSubmit={handleSendOtp} className="space-y-5">
                    <Input
                      label="Phone number"
                      type="tel"
                      placeholder="+63 917 123 4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      autoComplete="tel"
                    />
                    <p className="text-xs text-gray-500">
                      Enter the phone number registered with your clinic.
                      A 6-digit code will be sent via SMS — valid for 5 minutes.
                    </p>
                    <Button type="submit" isLoading={otpLoading} className="w-full" size="lg">
                      Send OTP
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-5">
                    <p className="text-sm text-gray-600">
                      A 6-digit code was sent to{" "}
                      <span className="font-semibold text-gray-800">{phone}</span>.
                      {" "}
                      <button
                        type="button"
                        className="text-blue-600 hover:underline text-sm"
                        onClick={() => { setOtpStep("phone"); setOtpCode(""); setOtpError(null); }}
                      >
                        Wrong number?
                      </button>
                    </p>

                    <Input
                      label="OTP code"
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      required
                      autoComplete="one-time-code"
                    />

                    <Button type="submit" isLoading={otpLoading} className="w-full" size="lg">
                      Verify &amp; Sign In
                    </Button>

                    <p className="text-center text-sm">
                      {countdown > 0 ? (
                        <span className="text-gray-400">Resend in {countdown}s</span>
                      ) : (
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={requestOtp}
                          disabled={otpLoading}
                        >
                          Resend OTP
                        </button>
                      )}
                    </p>
                  </form>
                )}
              </>
            )}

            {/* ─────────── Tab 3 — QR Code ─────────── */}
            {activeTab === "qr" && (
              <>
                {qrError && <Alert variant="error" className="mb-6">{qrError}</Alert>}
                <form onSubmit={handleQrSubmit} className="space-y-5">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
                    <p className="font-medium text-blue-800 mb-2">How to use your QR card</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-700">
                      <li>Open your clinic-issued patient QR card</li>
                      <li>Scan it with your phone&apos;s camera app</li>
                      <li>Copy the code text that appears</li>
                      <li>Paste it in the field below</li>
                    </ol>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">
                      QR code data
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      rows={4}
                      placeholder={`{"type":"patient_login","patientId":"...","patientCode":"CLINIC-0001","tenantId":"..."}`}
                      value={qrCode}
                      onChange={(e) => setQrCode(e.target.value)}
                      required
                      spellCheck={false}
                    />
                  </div>

                  <Button type="submit" isLoading={qrLoading} className="w-full" size="lg">
                    Sign in with QR
                  </Button>
                </form>
              </>
            )}

          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Protected by 256-bit encryption. Your health data is safe.
        </p>
      </div>
    </div>
  );
}
