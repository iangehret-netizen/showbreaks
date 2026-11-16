// Weigh-Break Recorder: lets the site open with no signal at the fairgrounds.
// Your own files: network first (so updates show right away), cache as backup.
// Firebase and font files: cache first (they never change for a given version).
const CACHE_NAME = "wbr-v3";
const CORE = ["./", "./index.html", "./storage.js", "./firebase-config.js", "./seed.js", "./manifest.json", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png", "./favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin && url.pathname.startsWith(new URL("./", self.location).pathname);
  const lib = url.hostname === "www.gstatic.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (own) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) { const c = res.clone(); caches.open(CACHE_NAME).then((ca) => ca.put(req, c)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
    );
  } else if (lib) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && (res.status === 200 || res.type === "opaque")) { const c = res.clone(); caches.open(CACHE_NAME).then((ca) => ca.put(req, c)); }
        return res;
      }))
    );
  }
});
