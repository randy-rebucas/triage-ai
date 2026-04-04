import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "ClinicAI — AI-Powered Patient Triage",
    template: "%s | ClinicAI",
  },
  description:
    "A modern clinic management system with AI-assisted patient triage. Secure, compliant, and built for healthcare professionals.",
  keywords: ["clinic", "healthcare", "triage", "AI", "patient management"],
  robots: {
    index: false, // Healthcare system — no public indexing
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
