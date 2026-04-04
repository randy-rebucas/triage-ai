"use client";

// ─────────────────────────────────────────────────────────────────
// TenantNotFound — shown when subdomain does not match any active tenant
// ─────────────────────────────────────────────────────────────────

interface Props {
  subdomain: string;
}

export default function TenantNotFound({ subdomain }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex items-center justify-center w-20 h-20 rounded-full bg-red-100">
          <svg
            className="w-10 h-10 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Clinic Not Found
        </h1>

        <p className="text-gray-500 mb-2">
          <span className="font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-sm">
            {subdomain}
          </span>
        </p>

        <p className="text-gray-500 mb-8">
          This clinic address is not recognized or is no longer active. Please
          check the URL and try again, or contact your clinic to verify your
          access link.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
          >
            Back to Home
          </a>
          <a
            href="/onboard"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Register Your Clinic
          </a>
        </div>

        <p className="mt-8 text-xs text-gray-400">
          If you believe this is an error, please contact{" "}
          <a
            href="mailto:support@myclinicsoft.com"
            className="text-brand-600 underline"
          >
            support@myclinicsoft.com
          </a>
        </p>
      </div>
    </div>
  );
}
