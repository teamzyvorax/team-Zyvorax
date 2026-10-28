self.options = {
  "domain": "3nbf4.com",
  "zoneId": 12140437
};
self.lary = "";

// Keep Monetag's worker integration intact.
importScripts("https://3nbf4.com/act/files/service-worker.min.js?r=sw");

// ZyvoraX shell cache: install/activate only, so we do not compete
// with Monetag's own fetch handler.
const CACHE = "zyvorax-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});
