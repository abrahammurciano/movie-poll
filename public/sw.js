// Movie Night Polls service worker: app-shell caching only.
// Firestore and all other cross-origin traffic bypasses this worker.
const CACHE = 'movie-poll-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './logo.svg', './icons/icon-192.png'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

	// Vite build artifacts are content-hashed and immutable: cache-first.
	if (url.pathname.includes('/assets/')) {
		event.respondWith(
			caches.match(event.request).then(
				(hit) =>
					hit ||
					fetch(event.request).then((res) => {
						const copy = res.clone();
						caches.open(CACHE).then((cache) => cache.put(event.request, copy));
						return res;
					}),
			),
		);
		return;
	}

	// Navigations and other same-origin GETs: network-first, shell fallback.
	event.respondWith(
		fetch(event.request)
			.then((res) => {
				const copy = res.clone();
				caches.open(CACHE).then((cache) => cache.put(event.request, copy));
				return res;
			})
			.catch(() =>
				caches.match(event.request).then((hit) => hit || caches.match('./')),
			),
	);
});
