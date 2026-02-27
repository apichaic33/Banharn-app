// บ้านเฮือน — Service Worker v1.0
// Cache ไฟล์หลักไว้ใช้ offline

var CACHE_NAME = 'baanhuen-v1';
var CACHE_FILES = [
  '/Banharn-app/',
  '/Banharn-app/index.html',
  '/Banharn-app/manage.html',
  '/Banharn-app/report.html',
  '/Banharn-app/manifest.json',
  '/Banharn-app/icon-192x192.png',
  '/Banharn-app/icon-512x512.png',
  '/Banharn-app/apple-touch-icon.png'
];

// ติดตั้ง: cache ไฟล์หลัก
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting();
});

// Activate: ลบ cache เก่า
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network first → cache fallback
self.addEventListener('fetch', function(e) {
  // ไม่ cache request ไป GAS (ต้องการข้อมูลสดเสมอ)
  if (e.request.url.indexOf('script.google.com') >= 0) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(function(res) {
        // อัปเดต cache ด้วยข้อมูลล่าสุด
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
        return res;
      })
      .catch(function() {
        // offline → ใช้ cache
        return caches.match(e.request);
      })
  );
});
