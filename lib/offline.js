// オフライン対応の画面に依存しない処理：端末に残すデータ（最後に読み込んだ家計データ・送信待ちの支出）と、
// 送信待ちの支出を明細として見せるための変換、通信エラーの判定。
// ブラウザでは window.KakeiboOffline、Node（単体テスト）では require() で使う。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeiboOffline = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SNAPSHOT_VERSION = 1;
  var QUEUE_VERSION = 1;
  var MAX_QUEUE = 200;
  var PENDING_ID_PREFIX = "pending:";
  var SCOPES = ["shared", "advance", "mine", "partner"];
  var PAYERS = ["me", "partner"];
  var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  function storageKeys(namespace) {
    var ns = String(namespace || "prod");
    return {
      snapshot: "kakeibo:" + ns + ":snapshot:v" + SNAPSHOT_VERSION,
      queue: "kakeibo:" + ns + ":queue:v" + QUEUE_VERSION
    };
  }

  // 端末で発行する送信ID（UUID v4）。DB の transactions.client_request_id に入る。
  function newRequestId(cryptoApi) {
    var c = cryptoApi || (typeof crypto !== "undefined" ? crypto : null);
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    if (!c || typeof c.getRandomValues !== "function") throw new Error("この端末では送信IDを作れません。");
    var bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(bytes, function (b) { return (b + 0x100).toString(16).slice(1); }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function isValidDate(value) {
    if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
    var time = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }

  // 送信待ちの支出（手入力1件分）の中身を検証して、送信に使う項目だけにそろえる。不正なら null。
  function normalizeTx(tx) {
    if (!tx || typeof tx !== "object") return null;
    var merchant = typeof tx.merchant_name === "string" ? tx.merchant_name.trim() : "";
    var amount = Number(tx.amount);
    var share = tx.me_share_amount == null ? null : Number(tx.me_share_amount);
    if (!isValidDate(tx.date)) return null;
    if (!merchant || merchant.length > 200) return null;
    if (!Number.isFinite(amount) || Math.round(amount) !== amount || amount === 0) return null;
    if (SCOPES.indexOf(tx.scope) === -1 || PAYERS.indexOf(tx.payer) === -1) return null;
    if (share !== null && (!Number.isFinite(share) || Math.round(share) !== share)) return null;
    if (tx.category_name != null && typeof tx.category_name !== "string") return null;
    if (tx.memo != null && typeof tx.memo !== "string") return null;
    return {
      date: tx.date,
      merchant_name: merchant,
      amount: amount,
      category_name: tx.category_name || null,
      scope: tx.scope,
      payer: tx.payer,
      me_share_amount: share,
      memo: tx.memo || ""
    };
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry.id !== "string" || !UUID_PATTERN.test(entry.id)) return null;
    var tx = normalizeTx(entry.tx);
    if (!tx) return null;
    return {
      id: entry.id,
      tx: tx,
      remember: entry.remember === true,
      created_at: typeof entry.created_at === "string" ? entry.created_at : "",
      last_error: typeof entry.last_error === "string" && entry.last_error ? entry.last_error : null
    };
  }

  // 送信待ちの1件を作る。入力が不正なら例外。
  function createEntry(tx, options) {
    var opts = options || {};
    var entry = normalizeEntry({
      id: opts.id,
      tx: tx,
      remember: opts.remember === true,
      created_at: opts.now || new Date().toISOString(),
      last_error: null
    });
    if (!entry) throw new Error("送信待ちに保存できない内容です。");
    return entry;
  }

  function readJson(storage, key) {
    try {
      var text = storage && storage.getItem(key);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      return null;
    }
  }

  function writeJson(storage, key, value) {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function removeKey(storage, key) {
    try {
      if (storage) storage.removeItem(key);
    } catch (error) {
      // 端末の保存領域が使えないときは消すものもない。
    }
  }

  function isValidSnapshotData(data) {
    return !!data && typeof data === "object" &&
      Array.isArray(data.transactions) && Array.isArray(data.categories) && Array.isArray(data.settlements);
  }

  // 端末の保存領域（localStorage 互換）への読み書き。保存領域が使えない端末でも例外にしない。
  function createStore(storage, namespace) {
    var keys = storageKeys(namespace);

    function loadQueue() {
      var saved = readJson(storage, keys.queue);
      var list = saved && Array.isArray(saved.entries) ? saved.entries : [];
      var seen = {};
      return list.map(normalizeEntry).filter(function (entry) {
        if (!entry || seen[entry.id]) return false;
        seen[entry.id] = true;
        return true;
      });
    }

    function saveQueue(entries) {
      return writeJson(storage, keys.queue, { version: QUEUE_VERSION, entries: entries });
    }

    return {
      loadSnapshot: function () {
        var saved = readJson(storage, keys.snapshot);
        if (!saved || saved.version !== SNAPSHOT_VERSION || !isValidSnapshotData(saved.data)) return null;
        return { data: saved.data, saved_at: typeof saved.saved_at === "string" ? saved.saved_at : null };
      },
      saveSnapshot: function (data, savedAt) {
        if (!isValidSnapshotData(data)) return false;
        return writeJson(storage, keys.snapshot, { version: SNAPSHOT_VERSION, saved_at: savedAt, data: data });
      },
      loadQueue: loadQueue,
      // 追加・削除・エラー記録は、その時点の保存内容を読み直してから行う（送信中に別の追加があっても消さない）。
      enqueue: function (entry) {
        var valid = normalizeEntry(entry);
        if (!valid) throw new Error("送信待ちに保存できない内容です。");
        var queue = loadQueue().filter(function (x) { return x.id !== valid.id; });
        if (queue.length >= MAX_QUEUE) throw new Error("送信待ちが多すぎます。通信できる場所で送信してください。");
        queue.push(valid);
        if (!saveQueue(queue)) throw new Error("端末に保存できませんでした。");
        return valid;
      },
      remove: function (id) {
        return saveQueue(loadQueue().filter(function (x) { return x.id !== id; }));
      },
      markError: function (id, message) {
        return saveQueue(loadQueue().map(function (x) {
          if (x.id === id) x.last_error = String(message || "送信できませんでした");
          return x;
        }));
      },
      // 送信エラーの印を外して、次の送信で送り直す（一時的な障害で失敗した分を起動時に再送するため）。
      clearErrors: function () {
        var queue = loadQueue();
        if (!queue.some(function (x) { return x.last_error; })) return true;
        return saveQueue(queue.map(function (x) { x.last_error = null; return x; }));
      },
      clearAll: function () {
        removeKey(storage, keys.snapshot);
        removeKey(storage, keys.queue);
      }
    };
  }

  // 送信待ちの支出を、明細一覧などで使う明細の形にする。精算月は画面の判定（DB と同じ）で見込みを出す。
  function pendingTransactions(queue, settlementMonthFor) {
    return (queue || []).map(function (entry) {
      var tx = entry.tx;
      var month = settlementMonthFor ? settlementMonthFor(tx.date) : tx.date.slice(0, 7);
      return {
        id: PENDING_ID_PREFIX + entry.id,
        pending: true,
        pending_error: entry.last_error,
        client_request_id: entry.id,
        date: tx.date,
        settlement_month: month + "-01",
        merchant_name: tx.merchant_name,
        merchant_raw: null,
        amount: tx.amount,
        category_name: tx.category_name,
        scope: tx.scope,
        payer: tx.payer,
        me_share_amount: tx.scope === "shared" ? tx.me_share_amount : null,
        status: tx.amount < 0 ? "refunded" : "confirmed",
        source: "manual",
        memo: tx.memo,
        card_provider: null,
        card_label: null,
        card_id: null,
        import_batch_id: null,
        created_at: entry.created_at
      };
    });
  }

  // サーバーのデータに送信待ちの支出を足した、画面表示用のデータ（元のデータは変えない）。
  function mergeData(serverData, queue, settlementMonthFor) {
    if (!serverData) return serverData;
    var merged = {};
    Object.keys(serverData).forEach(function (key) { merged[key] = serverData[key]; });
    merged.transactions = pendingTransactions(queue, settlementMonthFor).concat(serverData.transactions || []);
    return merged;
  }

  function isPendingId(value) {
    return typeof value === "string" && value.indexOf(PENDING_ID_PREFIX) === 0;
  }

  // 通信できなかったことによる失敗か（DB が内容を拒否した失敗とは分ける）。
  // supabase-js は通信失敗を例外にせず、code が空で message に "Failed to fetch" などを入れて返す。
  function isNetworkError(error, online) {
    if (online === false) return true;
    if (!error) return false;
    if (error.name === "AuthRetryableFetchError") return true;
    var code = error.code == null ? "" : String(error.code);
    if (code && code !== "0") return false;
    var status = Number(error.status);
    if (Number.isFinite(status) && status > 0 && status < 500) return false;
    var text = String(error.message || error) + " " + String(error.details || "");
    return /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed|network connection|timed? ?out|offline/i.test(text);
  }

  return {
    MAX_QUEUE: MAX_QUEUE,
    storageKeys: storageKeys,
    newRequestId: newRequestId,
    normalizeTx: normalizeTx,
    createEntry: createEntry,
    createStore: createStore,
    pendingTransactions: pendingTransactions,
    mergeData: mergeData,
    isPendingId: isPendingId,
    isNetworkError: isNetworkError
  };
});
