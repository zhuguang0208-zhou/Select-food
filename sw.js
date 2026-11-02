/* 今天吃什么 · Service Worker
 * 目标：首屏离线可用。改了页面内容后，把 VERSION 加一，用户下次打开会换新。
 */
var VERSION = 'v1';
var CACHE = 'eat-what-' + VERSION;

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

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 跨域的（比如 unpkg 上的 OCR 引擎）交给浏览器自己处理，不缓存
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // 网络挂了：导航请求先退回首页缓存
        if (req.mode === 'navigate') {
          return caches.match('./').then(function (r) {
            return r || caches.match('./index.html');
          });
        }
        return undefined;
      });
    })
  );
});
