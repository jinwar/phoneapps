const CACHE = 'jump-rope-v1';
const ASSETS = ['./','./index.html','./style.css','./app.mjs','./detector.mjs','./manifest.json','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event => event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('jump-rope-') && key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=> {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached=>cached || fetch(event.request)));
});
