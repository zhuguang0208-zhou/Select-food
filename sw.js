/* 今天吃什么 · Service Worker
 *
 * 策略：
 *   页面导航（HTML） → 网络优先，2.5 秒超时或失败回退缓存
 *   其它同源静态资源 → 缓存优先
 * 这样改了线上，手机联网打开一次就是新的；断网也照样能开。
 *
 * 发版时把 VERSION 加一（和页面里的 BUILD 保持一致）。
 */
var VERSION = 'v6';
var CACHE = 'eat-what-' + VERSION;
var NET_TIMEOUT = 2500;

var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 逐项缓存：某个文件缺失（比如本地预览根目录没有 index.html）不影响整体
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function cachePut(req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}

function fromCache(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return caches.match('./').then(function (root) {
      return root || caches.match('./index.html');
    });
  });
}

// 网络优先：先试网络，超时或失败就退回缓存
function networkFirst(req) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      fromCache(req).then(resolve);
    }, NET_TIMEOUT);

    fetch(req).then(function (res) {
      cachePut(req, res);
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    }).catch(function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fromCache(req).then(resolve);
    });
  });
}

// 缓存优先：静态资源，没有再走网络
function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      cachePut(req, res);
      return res;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 跨域的（比如 unpkg 上的 OCR 引擎）交给浏览器自己处理，不缓存
  if (url.origin !== self.location.origin) return;

  var isPage = req.mode === 'navigate' || req.destination === 'document';
  e.respondWith(isPage ? networkFirst(req) : cacheFirst(req));
});
