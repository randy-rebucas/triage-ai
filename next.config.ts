import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict mode for catching issues early
  reactStrictMode: true,

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },

  // Server-side only packages that should not be bundled for client
  serverExternalPackages: ["mongoose", "bcryptjs", "axios"],

  // Environment variable exposure (public only)
  env: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "ClinicAI",
    NEXT_PUBLIC_APP_VERSION: "1.0.0",
  },
};

export default nextConfig;
