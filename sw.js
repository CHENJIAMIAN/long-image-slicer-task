const BASE_PATH = '/long-image-slicer-task';
const CACHE_NAME = 'long-image-slicer-v2';
const SHARE_CACHE = 'long-image-slicer-share-target';
const SHARE_TARGET_PATH = `${BASE_PATH}/share-target`;
const SHARE_PAYLOAD_PATH = `${BASE_PATH}/shared-images`;
const APP_SHELL = `${BASE_PATH}/`;
const ASSETS = [
  APP_SHELL,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icons/favicon.svg`,
  `${BASE_PATH}/icons/icon-192.svg`,
  `${BASE_PATH}/icons/icon-512.svg`
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== SHARE_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method === 'POST' && requestUrl.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  if (event.request.method === 'GET' && requestUrl.pathname === SHARE_PAYLOAD_PATH) {
    event.respondWith(readSharedPayload());
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok && requestUrl.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

async function handleShareTarget(event) {
  const formData = await event.request.formData();
  const sharedFiles = formData.getAll('shared-image').filter(isImageFile);
  const payload = await Promise.all(sharedFiles.map(serializeFile));
  const cache = await caches.open(SHARE_CACHE);

  await cache.put(
    SHARE_PAYLOAD_PATH,
    new Response(JSON.stringify({ files: payload }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    })
  );

  return Response.redirect(`${APP_SHELL}?share-target=1`, 303);
}

async function readSharedPayload() {
  const cache = await caches.open(SHARE_CACHE);
  const cached = await cache.match(SHARE_PAYLOAD_PATH);

  if (!cached) {
    return jsonResponse({ files: [] });
  }

  await cache.delete(SHARE_PAYLOAD_PATH);
  return cached;
}

function isImageFile(file) {
  return file instanceof File && typeof file.type === 'string' && file.type.startsWith('image/');
}

async function serializeFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return {
    name: file.name || `shared-image-${Date.now()}.png`,
    type: file.type || 'image/png',
    data: btoa(binary)
  };
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
