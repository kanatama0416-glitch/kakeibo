// Service Worker：オフラインでもアプリを起動できるように、画面と部品を端末に保存する。
// ・家計データ（Supabase への通信）には関与しない。データの端末保存は lib/offline.js が行う。
// ・バージョンは登録時の ?v=（boot.js の VERSION）。版が変わると古い保存分を消す。
"use strict";

var VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
var CACHE_PREFIX = "kakeibo-";
var CACHE_NAME = CACHE_PREFIX + VERSION;
// 外部から読み込むライブラリのうち、オフライン起動に保存しておくもの（画面が読み込んだ script のみ）。
var CDN_HOSTS = ["cdn.jsdelivr.net"];
var NETWORK_TIMEOUT_MS = 4000;
var MAX_CACHE_URLS = 200;
var SCOPE_URL = new URL(self.registration.scope);

function isSameOrigin(url) {
  return url.origin === SCOPE_URL.origin && url.pathname.indexOf(SCOPE_URL.pathname) === 0;
}

function isCdnScript(url) {
  return url.protocol === "https:" && CDN_HOSTS.indexOf(url.hostname) !== -1;
}

// 画面（HTML）はクエリ違い（?mode=test など）でも同じファイルなので、パスだけで保存する。
function pageKey(url) {
  var path = url.pathname.slice(-1) === "/" ? url.pathname + "index.html" : url.pathname;
  return url.origin + path;
}

// リダイレクトを経た応答は、画面として返すと Safari で失敗するため、本文だけの応答に作り直して保存する。
function storable(response) {
  if (!response || !response.redirected) return Promise.resolve(response);
  return response.blob().then(function (body) {
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  });
}

function putInCache(key, response) {
  if (!response || !(response.ok || response.type === "opaque")) return Promise.resolve();
  return storable(response.clone()).then(function (copy) {
    return caches.open(CACHE_NAME).then(function (cache) { return cache.put(key, copy); });
  }).catch(function () {});
}

function fromCache(key) {
  return caches.open(CACHE_NAME).then(function (cache) { return cache.match(key); });
}

// 通信を優先し、つながらない・遅いときは保存分を返す（ライブラリと画面の更新を受け取るため）。
function networkFirst(request, key) {
  var network = fetch(request).then(function (response) {
    putInCache(key, response);
    return response;
  });
  var timer = new Promise(function (resolve) {
    setTimeout(resolve, NETWORK_TIMEOUT_MS);
  }).then(function () { return fromCache(key); });

  return Promise.race([network.catch(function () { return null; }), timer]).then(function (first) {
    if (first) return first;
    return fromCache(key).then(function (cached) {
      return cached || network;
    });
  });
}

// ?v= 付きの部品は版ごとに中身が変わらないので、保存分を優先する。
function cacheFirst(request) {
  return fromCache(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      putInCache(request, response);
      return response;
    });
  });
}

self.addEventListener("install", function (event) {
  self.skipWaiting();
  var indexUrl = new URL("index.html", SCOPE_URL);
  event.waitUntil(
    fetch(new Request(indexUrl.href, { cache: "reload" }))
      .then(function (response) { return putInCache(pageKey(indexUrl), response); })
      .catch(function () {})
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (name) {
        return name.indexOf(CACHE_PREFIX) === 0 && name !== CACHE_NAME;
      }).map(function (name) { return caches.delete(name); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 画面が読み込んだ部品の一覧を受け取り、まだ保存していないものを保存する（初回表示の分も残すため）。
function cacheUrls(urls) {
  if (!Array.isArray(urls)) return Promise.resolve();
  return caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(urls.slice(0, MAX_CACHE_URLS).map(function (value) {
      var url;
      try { url = new URL(String(value), SCOPE_URL); } catch (error) { return null; }
      var same = isSameOrigin(url);
      if (!same && !isCdnScript(url)) return null;
      var key = url.href;
      return cache.match(key).then(function (hit) {
        if (hit) return null;
        var request = same ? new Request(url.href) : new Request(url.href, { mode: "no-cors" });
        return fetch(request).then(function (response) { return putInCache(key, response); }).catch(function () {});
      });
    }));
  });
}

self.addEventListener("message", function (event) {
  var data = event.data || {};
  if (data.type === "cache-urls") event.waitUntil(cacheUrls(data.urls));
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);

  if (request.mode === "navigate" && isSameOrigin(url)) {
    event.respondWith(networkFirst(request, pageKey(url)));
    return;
  }
  if (isSameOrigin(url)) {
    event.respondWith(url.searchParams.has("v") ? cacheFirst(request) : networkFirst(request, request));
    return;
  }
  if (isCdnScript(url) && request.destination === "script") {
    event.respondWith(networkFirst(request, request));
  }
  // それ以外（Supabase の API など）は通常どおり通信する。
});
