import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClinicAI — AI-Powered Patient Triage",
    short_name: "ClinicAI",
    description:
      "AI-assisted patient triage and clinic management. Describe your symptoms and get a structured assessment in minutes.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    categories: ["health", "medical"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/triage.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
        label: "AI Triage Chat",
      },
    ],
    shortcuts: [
      {
        name: "Start Triage",
        short_name: "Triage",
        description: "Begin a new AI symptom assessment",
        url: "/triage",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
