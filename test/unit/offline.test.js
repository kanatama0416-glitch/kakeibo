// オフライン対応（端末保存・送信待ち・通信エラー判定）の単体テスト。実行：node --test test/unit
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var offline = require("../../lib/offline.js");

function memoryStorage() {
  var map = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) { map[k] = String(v); },
    removeItem: function (k) { delete map[k]; },
    _map: map
  };
}

var ID1 = "11111111-1111-4111-8111-111111111111";
var ID2 = "22222222-2222-4222-8222-222222222222";
var baseTx = { date:"2026-10-13", merchant_name:" スーパー ", amount:1200, category_name:"食費",
  scope:"shared", payer:"me", me_share_amount:null, memo:"" };

test("送信IDは UUID v4 の形。randomUUID がない端末でも作れる", function () {
  var fake = { getRandomValues: function (a) { for (var i = 0; i < a.length; i += 1) a[i] = i * 17; return a; } };
  var id = offline.newRequestId(fake);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(offline.newRequestId({ randomUUID: function () { return ID1; } }), ID1);
});

test("送信待ちの1件は入力を検証してそろえる（店名の前後空白を除く）", function () {
  var entry = offline.createEntry(baseTx, { id:ID1, now:"2026-10-13T03:00:00Z", remember:true });
  assert.equal(entry.tx.merchant_name, "スーパー");
  assert.equal(entry.remember, true);
  assert.equal(entry.last_error, null);
  assert.throws(function () { offline.createEntry(Object.assign({}, baseTx, { amount:0 }), { id:ID1 }); });
  assert.throws(function () { offline.createEntry(Object.assign({}, baseTx, { date:"2026-02-30" }), { id:ID1 }); });
  assert.throws(function () { offline.createEntry(Object.assign({}, baseTx, { scope:"x" }), { id:ID1 }); });
  assert.throws(function () { offline.createEntry(Object.assign({}, baseTx, { amount:12.5 }), { id:ID1 }); });
  assert.throws(function () { offline.createEntry(baseTx, { id:"not-a-uuid" }); });
});

test("送信待ちは端末に残り、読み直しても同じ。削除・エラー記録ができる", function () {
  var storage = memoryStorage();
  var store = offline.createStore(storage, "test");
  store.enqueue(offline.createEntry(baseTx, { id:ID1 }));
  store.enqueue(offline.createEntry(Object.assign({}, baseTx, { amount:-300 }), { id:ID2 }));
  var again = offline.createStore(storage, "test");
  assert.deepEqual(again.loadQueue().map(function (e) { return e.id; }), [ID1, ID2]);
  again.markError(ID2, "費目がありません");
  assert.equal(again.loadQueue()[1].last_error, "費目がありません");
  var copy = offline.createStore(storage, "test");
  copy.clearErrors();
  assert.equal(copy.loadQueue()[1].last_error, null);
  again.markError(ID2, "費目がありません");
  again.remove(ID1);
  assert.deepEqual(again.loadQueue().map(function (e) { return e.id; }), [ID2]);
});

test("同じ送信IDを二度入れても1件。本番とテストの保存場所は分かれる", function () {
  var storage = memoryStorage();
  var prod = offline.createStore(storage, "prod");
  prod.enqueue(offline.createEntry(baseTx, { id:ID1 }));
  prod.enqueue(offline.createEntry(baseTx, { id:ID1 }));
  assert.equal(prod.loadQueue().length, 1);
  assert.equal(offline.createStore(storage, "test").loadQueue().length, 0);
});

test("壊れた保存内容・不正な行は読み飛ばす", function () {
  var storage = memoryStorage();
  var keys = offline.storageKeys("prod");
  storage.setItem(keys.queue, "{not json");
  var store = offline.createStore(storage, "prod");
  assert.deepEqual(store.loadQueue(), []);
  storage.setItem(keys.queue, JSON.stringify({ version:1, entries:[
    { id:ID1, tx:baseTx }, { id:ID2, tx:{ date:"x" } }, null, { id:"<script>", tx:baseTx }
  ] }));
  assert.deepEqual(store.loadQueue().map(function (e) { return e.id; }), [ID1]);
  storage.setItem(keys.snapshot, JSON.stringify({ version:1, data:{ transactions:"x" } }));
  assert.equal(store.loadSnapshot(), null);
});

test("最後に読み込んだデータを保存・復元し、clearAll で消える", function () {
  var storage = memoryStorage();
  var store = offline.createStore(storage, "prod");
  var data = { transactions:[{ id:1 }], categories:[], settlements:[] };
  assert.equal(store.saveSnapshot(data, "2026-10-13T03:00:00Z"), true);
  assert.deepEqual(store.loadSnapshot(), { data:data, saved_at:"2026-10-13T03:00:00Z" });
  store.enqueue(offline.createEntry(baseTx, { id:ID1 }));
  store.clearAll();
  assert.equal(store.loadSnapshot(), null);
  assert.deepEqual(store.loadQueue(), []);
});

test("保存領域が使えない端末でも例外にならない（送信待ちの追加だけは失敗を知らせる）", function () {
  var broken = { getItem: function () { throw new Error("denied"); },
    setItem: function () { throw new Error("quota"); }, removeItem: function () { throw new Error("denied"); } };
  var store = offline.createStore(broken, "prod");
  assert.equal(store.loadSnapshot(), null);
  assert.deepEqual(store.loadQueue(), []);
  assert.equal(store.saveSnapshot({ transactions:[], categories:[], settlements:[] }, "x"), false);
  store.clearAll();
  assert.throws(function () { store.enqueue(offline.createEntry(baseTx, { id:ID1 })); }, /保存できませんでした/);
  assert.equal(offline.createStore(null, "prod").loadSnapshot(), null);
});

test("送信待ちは明細の形で先頭に足され、元のデータは変わらない。精算月は渡した判定で決まる", function () {
  var server = { transactions:[{ id:5, date:"2026-10-01" }], categories:[], settlements:[] };
  var queue = [offline.createEntry(Object.assign({}, baseTx, { amount:-300 }), { id:ID1 })];
  var merged = offline.mergeData(server, queue, function () { return "2026-11"; });
  assert.equal(server.transactions.length, 1);
  assert.equal(merged.transactions.length, 2);
  var p = merged.transactions[0];
  assert.equal(p.id, "pending:" + ID1);
  assert.equal(p.pending, true);
  assert.equal(p.settlement_month, "2026-11-01");
  assert.equal(p.status, "refunded");
  assert.equal(offline.isPendingId(p.id), true);
  assert.equal(offline.isPendingId(5), false);
  assert.equal(offline.mergeData(null, queue), null);
});

test("通信の失敗と、DB が内容を拒否した失敗を分ける", function () {
  assert.equal(offline.isNetworkError({ message:"TypeError: Failed to fetch", code:"" }), true);
  assert.equal(offline.isNetworkError({ message:"Load failed" }), true);
  assert.equal(offline.isNetworkError({ name:"AuthRetryableFetchError", message:"x", status:0 }), true);
  assert.equal(offline.isNetworkError(new TypeError("NetworkError when attempting to fetch resource.")), true);
  assert.equal(offline.isNetworkError({ message:"anything" }, false), true);
  assert.equal(offline.isNetworkError({ message:"new row violates row-level security", code:"42501" }), false);
  assert.equal(offline.isNetworkError({ message:"Failed to fetch", code:"23505" }), false);
  assert.equal(offline.isNetworkError({ message:"Invalid Refresh Token", status:400 }), false);
  assert.equal(offline.isNetworkError(null), false);
});
