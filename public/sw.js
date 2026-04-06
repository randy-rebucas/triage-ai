/**
 * Triage AI Service Worker
 *
 * Strategy:
 *  - App shell (JS/CSS/fonts) → Cache-First (stale-while-revalidate)
 *  - Navigation (HTML pages)  → Network-First with offline fallback
 *  - API routes               → Network-Only (never cache patient data)
 *  - Images / icons           → Cache-First with long TTL
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE   = `clinic-shell-${CACHE_VERSION}`;
const IMAGE_CACHE   = `clinic-images-${CACHE_VERSION}`;
const OFFLINE_URL   = "/offline";

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  "/",
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ──────────────────────────────────────────────────────────────────────────────
// Message — handle SKIP_WAITING from update banner
// ──────────────────────────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Install — precache shell assets
// ──────────────────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// Activate — purge old caches
// ──────────────────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== IMAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// Fetch — route-based strategy
// ──────────────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // API routes → Network-Only (patient data must never be cached)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Next.js internals (_next/data, _next/static HMR) — let through
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // Static assets (_next/static JS/CSS chunks) → Cache-First
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Images / icons → Cache-First with image cache
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)
  ) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // HTML navigation → Network-First with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Everything else → Network-First
  event.respondWith(networkFirst(request));
});

// ──────────────────────────────────────────────────────────────────────────────
// Strategy helpers
// ──────────────────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache  = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    return cached ?? new Response("Offline", { status: 503 });
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cache  = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    // Serve the offline page
    const offline = await cache.match(OFFLINE_URL);
    return (
      offline ??
      new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Offline — Triage AI</title>
        <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#111827}
        .card{background:#fff;border-radius:16px;padding:40px;text-align:center;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
        h1{font-size:1.5rem;margin:0 0 8px}p{color:#6b7280;margin:0 0 24px}
        a{display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:500}</style>
        </head><body><div class="card">
        <div style="font-size:3rem;margin-bottom:16px">🏥</div>
        <h1>You're offline</h1>
        <p>Triage AI needs an internet connection. Please check your network and try again.</p>
        <a href="/">Retry</a></div></body></html>`,
        { status: 200, headers: { "Content-Type": "text/html;charset=utf-8" } },
      )
    );
  }
}
