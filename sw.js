// CtrlSet service worker — caches the app shell so the app can be
// installed to a home screen and load without a connection. It does
// NOT queue or replay failed Supabase writes; saving a workout still
// requires being online. Draft autosave (localStorage) already works
// offline on its own, independent of this file.

const CACHE_VERSION = 'ctrlset-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/auth.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/ui.js',
  '/js/timers.js',
  '/js/data.js',
  '/js/push.js',
  '/js/workout.js',
  '/js/charts.js',
  '/js/history.js',
  '/js/achievements.js',
  '/js/app.js',
  '/appicon/icon-192.png',
  '/appicon/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* non-JSON payload, use defaults */ }

  const title = data.title || 'Time to train 💪';
  const options = {
    body: data.body || "It's one of your usual training days — log today's workout on CtrlSet.",
    icon: '/appicon/icon-192.png',
    badge: '/appicon/icon-192.png',
    // Same tag as the in-app same-tab fallback notification (checkWorkoutReminder
    // in data.js), so if both happen to fire, the second one replaces rather
    // than stacking as a duplicate.
    tag: 'ctrlset-workout-reminder'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/?action=start-workout');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept Supabase API calls — these need to hit the network
  // live (or fail live) so the app's own error handling/toasts fire
  // correctly. Caching these would risk serving stale or wrong data.
  if (url.hostname.endsWith('supabase.co')) return;

  // Only handle GET requests; everything else passes straight through.
  if (event.request.method !== 'GET') return;

  // Navigation requests (loading index.html): try the network first so
  // users online always get the latest version, falling back to the
  // cached shell when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else in the app shell (CSS/JS/icons/CDN libs): cache-first,
  // refreshing the cache in the background when the network succeeds.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});
