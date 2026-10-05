// カード明細取込の判定の単体テスト。実行：node --test test/unit
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var cardImport = require("../../lib/card-import.js");

function row(date, merchant, amount) {
  return { date:date, merchant_name:merchant, amount:amount, selected:true, duplicate:false, matchReason:"" };
}

var existing = [
  { id:101, date:"2026-10-03", merchant_name:"スーパー", amount:4200, memo:"CSV取込" },
  { id:102, date:"2026-10-08", merchant_name:"電気", amount:6800, memo:"" },
  { id:103, date:"2026-10-09", merchant_name:"八百屋", amount:900, memo:"現金" }
];

test("登録済みと一致する行は重複として外す（1件に対応づくのは1行だけ）", function () {
  var context = cardImport.newDuplicateContext();
  var first = cardImport.applyDuplicateCheck(existing, row("2026-10-03", "スーパー", 4200), context, "CSV");
  var second = cardImport.applyDuplicateCheck(existing, row("2026-10-03", "スーパー", 4200), context, "CSV");
  assert.equal(first.duplicate, true);
  assert.equal(first.selected, false);
  assert.equal(second.duplicate, false);
  assert.equal(second.selected, true);
  assert.equal(second.sameFileRepeat, true);
});

test("同じファイル内の同日・同額・同店は両方登録し、2行目に注意を出す", function () {
  var context = cardImport.newDuplicateContext();
  var a = cardImport.applyDuplicateCheck(existing, row("2026-11-05", "コンビニ", 500), context, "PDF");
  var b = cardImport.applyDuplicateCheck(existing, row("2026-11-05", "コンビニ", 500), context, "PDF");
  assert.equal(a.selected, true);
  assert.equal(a.matchReason, "");
  assert.equal(b.selected, true);
  assert.match(b.matchReason, /このPDF内に同じ日・金額・利用先の明細がもう1件あります/);
});

test("店舗ルールの注意文は残したまま、同一ファイル内の注意を追記する", function () {
  var context = cardImport.newDuplicateContext();
  cardImport.applyDuplicateCheck(existing, row("2026-11-05", "薬局", 300), context, "CSV");
  var second = row("2026-11-05", "薬局", 300);
  second.matchReason = "店舗ルールが「毎回確認」です。";
  cardImport.applyDuplicateCheck(existing, second, context, "CSV");
  assert.match(second.matchReason, /^店舗ルールが「毎回確認」です。 このCSV内に/);
});

test("前後3日以内の同店・同額も重複、現金メモの明細は対象外", function () {
  var near = cardImport.findExistingMatch(existing, row("2026-10-10", "電気", 6800), {});
  assert.equal(near.tx.id, 102);
  assert.match(near.reason, /前後3日以内/);
  assert.equal(cardImport.findExistingMatch(existing, row("2026-10-09", "八百屋", 900), {}), null);
  assert.equal(cardImport.findExistingMatch(existing, row("2026-10-20", "電気", 6800), {}), null);
});

test("利用先の表記ゆれ（全角・空白・記号）は同じ店として扱う", function () {
  var match = cardImport.findExistingMatch(existing, row("2026-10-03", "ｽｰﾊﾟｰ ", 4200), {});
  assert.equal(match.tx.id, 101);
});

test("取込状況：登録済みカードごとに何月分を取り込んだか返す", function () {
  var data = {
    cards:[
      { id:2, owner:"partner", provider:"epos", name:"エポスカード" },
      { id:1, owner:"me", provider:"rakuten", name:"楽天カード" }
    ],
    import_batches:[
      { id:1, card_id:1, target_month:"2026-10-01", imported_count:8 },
      { id:2, card_id:1, target_month:"2026-10-01", imported_count:2 },
      { id:3, card_id:2, target_month:"2026-09-01", imported_count:5 }
    ]
  };
  var status = cardImport.cardImportStatus(data, "2026-10");
  assert.deepEqual(status.map(function (s) { return [s.card.id, s.imported, s.count]; }), [[1, true, 10], [2, false, 0]]);
});

test("取込状況：カード未登録なら取込できるカード会社を未取込として並べる", function () {
  var status = cardImport.cardImportStatus({ cards:[], import_batches:[] }, "2026-10");
  assert.deepEqual(status.map(function (s) { return [s.card.provider, s.imported]; }), [["rakuten", false], ["epos", false]]);
});
