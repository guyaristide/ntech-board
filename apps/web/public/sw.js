/*
 * Service worker de NTECH Board : rend l'application installable, garde sa coquille pour un
 * démarrage rapide et hors connexion, et affiche les notifications système (push).
 * Les données (/api) ne sont jamais mises en cache : elles viennent toujours du serveur.
 */
const SHELL = 'board-shell-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then(cache => cache.add(new Request('/', { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/'))
    return;
  // Page : le réseau d'abord (toujours la dernière version), la coquille gardée si le réseau manque.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL).then(cache => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then(r => r || Response.error())),
    );
    return;
  }
  // Fichiers de l'application (noms uniques par version) et images de marque : le cache d'abord.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.match(request).then(
        hit =>
          hit ||
          fetch(request).then(response => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL).then(cache => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

// Notification système : le serveur envoie le titre, le texte et l'adresse à ouvrir.
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'NTECH Board', {
      body: data.body || '',
      icon: '/brand/icon-192.png',
      badge: '/brand/favicon-96.png',
      // Même sujet : la nouvelle notification remplace l'ancienne au lieu de s'empiler.
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { path: data.path || '/' },
    }),
  );
});

// Clic : on ramène l'onglet du tableau s'il est ouvert, sinon on l'ouvre, sur le bon élément.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => new URL(c.url).origin === self.location.origin);
      if (open) {
        open.postMessage({ type: 'open', path });
        return open.focus();
      }
      return self.clients.openWindow(path);
    }),
  );
});
