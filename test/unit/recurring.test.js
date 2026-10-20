"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var recurring = require("../../lib/recurring.js");

function template(fields) {
  return Object.assign({
    id: 1, name: "家賃", amount: 80000, category_name: "住居", scope: "shared", payer: "me",
    me_share_amount: null, day_of_month: 27, start_month: "2026-10-01",
    last_generated_month: null, is_active: true, memo: null
  }, fields || {});
}

test("開始月〜今月を1件ずつ作る", function () {
  assert.deepEqual(recurring.monthsToGenerate(template(), "2026-12"), ["2026-10", "2026-11", "2026-12"]);
});

test("作り終えた月より後だけ作る（削除した月を作り直さない）", function () {
  assert.deepEqual(recurring.monthsToGenerate(template({ last_generated_month: "2026-11-01" }), "2026-12"), ["2026-12"]);
  assert.deepEqual(recurring.monthsToGenerate(template({ last_generated_month: "2026-12-01" }), "2026-12"), []);
});

test("開始月が未来・停止中・運用開始前", function () {
  assert.deepEqual(recurring.monthsToGenerate(template({ start_month: "2027-01-01" }), "2026-12"), []);
  assert.deepEqual(recurring.monthsToGenerate(template({ is_active: false }), "2026-12"), []);
  assert.deepEqual(recurring.monthsToGenerate(template({ start_month: "2026-08-01" }), "2026-10"), ["2026-10"]);
});

test("年をまたぐ", function () {
  assert.deepEqual(recurring.monthsToGenerate(template({ last_generated_month: "2026-12-01" }), "2027-02"), ["2027-01", "2027-02"]);
});

test("指定日がない月は月末", function () {
  assert.equal(recurring.dateInMonth("2027-02", 31), "2027-02-28");
  assert.equal(recurring.dateInMonth("2028-02", 30), "2028-02-29");
  assert.equal(recurring.dateInMonth("2026-11", 31), "2026-11-30");
  assert.equal(recurring.dateInMonth("2026-10", 5), "2026-10-05");
});

test("作る明細の項目", function () {
  var rows = recurring.transactionsToGenerate(template({ scope: "shared", me_share_amount: 30000 }), "2026-10");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    recurring_expense_id: 1, recurring_month: "2026-10-01", date: "2026-10-27", merchant_name: "家賃",
    amount: 80000, category_name: "住居", scope: "shared", payer: "me", me_share_amount: 30000,
    status: "confirmed", memo: null
  });
  var advance = recurring.transactionsToGenerate(template({ scope: "advance", me_share_amount: 100 }), "2026-10");
  assert.equal(advance[0].me_share_amount, null);
});

test("入力チェック", function () {
  var ok = { name: "家賃", amount: 80000, category_name: "住居", day_of_month: 27, start_month: "2026-10" };
  assert.equal(recurring.validate(ok), "");
  assert.equal(recurring.validate(Object.assign({}, ok, { name: "  " })), "NAME_REQUIRED");
  assert.equal(recurring.validate(Object.assign({}, ok, { amount: 0 })), "AMOUNT_REQUIRED");
  assert.equal(recurring.validate(Object.assign({}, ok, { amount: 1.5 })), "AMOUNT_REQUIRED");
  assert.equal(recurring.validate(Object.assign({}, ok, { category_name: "" })), "CATEGORY_REQUIRED");
  assert.equal(recurring.validate(Object.assign({}, ok, { day_of_month: 32 })), "DAY_INVALID");
  assert.equal(recurring.validate(Object.assign({}, ok, { day_of_month: 0 })), "DAY_INVALID");
  assert.equal(recurring.validate(Object.assign({}, ok, { start_month: "2026-13" })), "START_MONTH_INVALID");
  assert.equal(recurring.validate(Object.assign({}, ok, { start_month: "2026-09" })), "START_MONTH_TOO_EARLY");
});

test("表示", function () {
  assert.equal(recurring.scheduleLabel(27), "毎月27日");
  assert.equal(recurring.scheduleLabel(31), "毎月末日");
});
