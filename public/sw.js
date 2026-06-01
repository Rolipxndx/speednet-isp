const CACHE_NAME = 'speednet-v3'; // <-- Incrementamos a v3
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Instalación tolerante a errores 404
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // En lugar de addAll, mapeamos las promesas para que si una falla, no rompa el resto
      const cachePromises = urlsToCache.map((url) => {
        return cache.add(url).catch((err) => {
          console.warn(`No se pudo precargar en caché el recurso: ${url}`, err);
        });
      });
      return Promise.all(cachePromises);
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpieza radical de cachés antiguas
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Toma el control de la página web inmediatamente
  );
});

// Estrategia Fetch: Network-First (Primero Red) con fallback a Caché
// Esto evita pantallas en blanco al actualizar archivos JS de Vite en Vercel
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones de nuestro propio origen (mismo dominio)
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Si la respuesta es válida, guardamos una copia en caché por si se queda offline
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Si internet falla (offline), buscamos en la caché el recurso
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Si es una ruta de navegación y no hay red ni caché, servir el index.html base
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
        })
    );
  }
});