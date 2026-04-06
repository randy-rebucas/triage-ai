"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAProvider() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner]       = useState(false);
  const [updateReady, setUpdateReady]     = useState(false);

  // ── Service Worker registration ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Listen for new SW waiting → show "Update available" banner
        const checkUpdate = () => {
          if (registration.waiting) setUpdateReady(true);
        };
        checkUpdate();
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      })
      .catch((err) => {
        if (process.env.NODE_ENV === "development") {
          console.warn("[PWA] Service worker registration failed:", err);
        }
      });
  }, []);

  // ── Install prompt (beforeinstallprompt) ─────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);

      // Only show banner if user hasn't dismissed it before
      const dismissed = sessionStorage.getItem("pwa-banner-dismissed");
      if (!dismissed) setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
      setInstallPrompt(null);
    }
  };

  const dismissBanner = () => {
    setShowBanner(false);
    sessionStorage.setItem("pwa-banner-dismissed", "1");
  };

  const handleUpdate = () => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    });
  };

  return (
    <>
      {/* ── Install banner ─────────────────────────────────────────────── */}
      {showBanner && !updateReady && (
        <div
          role="banner"
          aria-label="Install ClinicAI app"
          className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto bg-white border border-blue-200 rounded-2xl shadow-xl p-4 flex items-start gap-3 animate-slide-up"
        >
          <div className="shrink-0 w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white text-lg">
            🏥
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              Add ClinicAI to your home screen
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Faster access, works offline
            </p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              onClick={handleInstall}
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Install
            </button>
            <button
              onClick={dismissBanner}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1"
              aria-label="Dismiss install banner"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* ── Update available banner ─────────────────────────────────────── */}
      {updateReady && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto bg-emerald-600 text-white rounded-2xl shadow-xl p-4 flex items-center gap-3 animate-slide-up"
        >
          <span className="text-lg shrink-0">✨</span>
          <div className="flex-1">
            <p className="text-sm font-semibold leading-tight">Update available</p>
            <p className="text-xs opacity-80 mt-0.5">Refresh to get the latest version</p>
          </div>
          <button
            onClick={handleUpdate}
            className="shrink-0 text-xs font-semibold bg-white text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            Update
          </button>
        </div>
      )}
    </>
  );
}
