// 費目別の集計の単体テスト。実行：node --test test/unit
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var view = require("../../lib/category-view.js");

var txs = [
  { id:1, date:"2026-09-28", category_name:"食費", amount:1000, scope:"shared", status:"confirmed" },
  { id:2, date:"2026-10-03", category_name:"食費", amount:4200, scope:"shared", status:"confirmed" },
  { id:3, date:"2026-10-03", category_name:"食費", amount:800, scope:"shared", status:"confirmed" },
  { id:4, date:"2026-10-15", category_name:"食費", amount:-300, scope:"shared", status:"refunded" },
  { id:5, date:"2026-11-02", category_name:"食費", amount:5100, scope:"shared", status:"confirmed" },
  { id:6, date:"2026-12-01", category_name:"食費", amount:9999, scope:"shared", status:"confirmed" },
  { id:7, date:"2026-10-10", category_name:"食費", amount:700, scope:"mine", status:"confirmed" },
  { id:8, date:"2026-10-11", category_name:"食費", amount:600, scope:"advance", status:"confirmed" },
  { id:9, date:"2026-10-12", category_name:"食費", amount:500, scope:null, status:"unclassified" },
  { id:10, date:"2026-10-20", category_name:"日用品", amount:2600, scope:"shared", status:"confirmed" },
  { id:11, date:"2026-10-21", category_name:null, amount:1200, scope:"shared", status:"confirmed" }
];

test("選んだ費目・期間の共同の生活費だけを合計する（対象外・立替・未仕分けは含めない）", function () {
  var result = view.summarize(txs, { category:"食費", startMonth:"2026-10", endMonth:"2026-11" });
  assert.equal(result.total, 4200 + 800 - 300 + 5100);
  assert.equal(result.count, 4);
  assert.deepEqual(result.range, { start:"2026-10", end:"2026-11" });
});

test("月ごとに新しい順でまとめ、月の小計を出す。同じ日は id の大きい順", function () {
  var result = view.summarize(txs, { category:"食費", startMonth:"2026-10", endMonth:"2026-11" });
  assert.deepEqual(result.months.map(function (m) { return [m.month, m.total, m.count]; }),
    [["2026-11", 5100, 1], ["2026-10", 4700, 3]]);
  assert.deepEqual(result.months[1].transactions.map(function (t) { return t.id; }), [4, 3, 2]);
});

test("期間が逆順でも入れ替えて集計する。境界の月を含む", function () {
  var result = view.summarize(txs, { category:"食費", startMonth:"2026-10", endMonth:"2026-09" });
  assert.deepEqual(result.range, { start:"2026-09", end:"2026-10" });
  assert.equal(result.total, 1000 + 4200 + 800 - 300);
});

test("費目がない明細は「費目なし」として選べる", function () {
  var result = view.summarize(txs, { category:view.NO_CATEGORY_LABEL, startMonth:"2026-10", endMonth:"2026-10" });
  assert.equal(result.total, 1200);
  assert.equal(result.count, 1);
});

test("不正な期間・費目なしの指定・該当なしは0件で返す", function () {
  assert.equal(view.summarize(txs, { category:"食費", startMonth:"2026/10", endMonth:"2026-11" }).count, 0);
  assert.equal(view.summarize(txs, { category:"", startMonth:"2026-10", endMonth:"2026-11" }).count, 0);
  var none = view.summarize(txs, { category:"交通", startMonth:"2026-10", endMonth:"2026-11" });
  assert.equal(none.total, 0);
  assert.deepEqual(none.months, []);
  assert.equal(view.summarize(null, { category:"食費", startMonth:"2026-10", endMonth:"2026-10" }).count, 0);
});

test("期間内の費目ごとの合計は summarize の合計と一致する", function () {
  var totals = view.totalsInRange(txs, "2026-10", "2026-11");
  assert.deepEqual(totals, { "食費":9800, "日用品":2600, "費目なし":1200 });
  Object.keys(totals).forEach(function (name) {
    assert.equal(view.summarize(txs, { category:name, startMonth:"2026-10", endMonth:"2026-11" }).total, totals[name]);
  });
});
