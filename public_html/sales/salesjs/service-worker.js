const CACHE_NAME = 'pos-cache-v1';

const urlsToCache = [
  '/', // If served from root
  '/sales/pos.html',
  '/sales/reports.html',
  '/sales/invoice.html',
  '/sales/salesjs/pos.js',
  '/sales/salesjs/sales-report.js',
  '/sales/salesjs/clockin.js',
  '/assets/js/component.js', 

    '/component/header.html',
  '/component/footer.html',
  '/component/sidebar.html',

  // Assets from your local folders (relative to where the service worker is served)
  '/assets/images/favicon.svg',
  '/assets/images/gas1.png',
  '/assets/images/IMG_4703.PNG',
  '/assets/fonts/bootstrap/bootstrap-icons.css',
  '/assets/css/main.min.css',
  '/assets/css/qode-d1.css',

  // CDN files (these will work if the user loaded them once online)
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://code.jquery.com/jquery-3.7.1.min.js',
  'https://cdn.datatables.net/1.13.7/css/jquery.dataTables.min.css',
  'https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

// ✅ Install
self.addEventListener('install', event => {
  console.log('📦 Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// ✅ Activate and clean up old caches
self.addEventListener('activate', event => {
  console.log('🔁 Activating new service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
});

// ✅ Fetch
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Block login pages from offline access
  if (
    url.pathname.startsWith('/staff-login') ||
    url.pathname.startsWith('/account/login') ||
    url.pathname.startsWith('/staff-login/login-otp-verify.html')
  ) {
  
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response('⚠️ Login requires internet connection.', {
          status: 503,
          statusText: 'Offline'
        })
      )
    );
    return;
  }


  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(response => {
        return response || new Response('⚠️ Resource not available offline', {
          status: 503,
          statusText: 'Offline'
        });
      })
    )
  );
});