const CACHE_NAME = 'vannet-v2';
const ASSETS = [
  './',
  './index.html',
  './settings.html',
  './charts.html',
  './humcharts.html',
  './presscharts.html',
  './aircharts.html',
  './tank1.html',
  './tank2.html',
  './about.html',
  './app.js',
  './appair.js',
  './apppress.js',
  './apptank1.js',
  './apptank2.js',
  './appumidit.js',
  './style.css',
  './speedometer.svg',
  './search.svg', 
  './thermometer.svg',
  './drop-half-bottom.svg',
  './cloud-sun.svg',
  './fan.svg',
  './tank_1.svg',
  './tank_2.svg',
  './gear.svg',
  './info.svg',
  './footer.html'
];
// Note: We deliberately exclude external CDNs (Bootstrap, Chart.js) from strict caching to avoid CORS issues if not configured, 
// though the browser will cache them normally. We also exclude the Google Script URL.

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  // Don't cache the Google Script calls or other external API calls strongly
  if (e.request.url.includes('script.google.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});
