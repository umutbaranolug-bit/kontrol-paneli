// Kontrol Paneli — service worker
//
// İki iş yapıyor:
//   1. Android'de bildirim yolunu açmak. Chrome'da new Notification() yasak;
//      ServiceWorkerRegistration.showNotification() zorunlu. Bu dosya kayıtlı
//      olmadan mola bildirimi hiçbir koşulda çıkmıyor.
//   2. İnternet yokken panelin açılmasını sağlamak.
//
// Strateji bilerek NETWORK-FIRST: önce ağdan dener, olmazsa önbellekten verir.
// Cache-first olsaydı GitHub Pages'e attığın her yeni sürüm telefonunda takılı
// kalırdı — panelde bir şey değiştirdiğinde neden görünmediğini aramak zorunda
// kalmazsın diye böyle.

const CACHE = 'kp-v2';
const SHELL = ['./', './index.html', './analiz.html', './manifest.json', './icon-192.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // Tek tek ekle: icon gibi bir dosya eksikse addAll komple patlıyor,
      // bu haliyle eksik dosya sessizce atlanır ve kurulum yine tamamlanır.
      Promise.all(SHELL.map(u => c.add(u).catch(() => null)))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Apps Script sync'e karışma

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});

// Bildirime dokununca paneli öne getir, açık sekme yoksa aç.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.registration.scope) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
