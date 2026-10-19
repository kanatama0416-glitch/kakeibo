const test = require("node:test");
const assert = require("node:assert/strict");
const recurring = require("../../lib/recurring.js");

const base = {
  id: 1, name: "家賃", amount: 80000, day_of_month: 27, scope: "shared", payer: "me",
  me_share_amount: null, memo: "", start_month: "2026-10-01", last_generated_month: null, active: true
};

test("occurrenceDate: 月にない日は月末にそろえる", () => {
  assert.equal(recurring.occurrenceDate("2026-10", 27), "2026-10-27");
  assert.equal(recurring.occurrenceDate("2026-11", 31), "2026-11-30");
  assert.equal(recurring.occurrenceDate("2027-02", 30), "2027-02-28");
  assert.equal(recurring.occurrenceDate("2028-02", 31), "2028-02-29");
  assert.equal(recurring.occurrenceDate("2026-10", 1), "2026-10-01");
});

test("monthsToGenerate: 初回は開始月〜今月", () => {
  assert.deepEqual(recurring.monthsToGenerate(base, "2026-10"), ["2026-10"]);
  assert.deepEqual(recurring.monthsToGenerate(base, "2026-12"), ["2026-10", "2026-11", "2026-12"]);
});

test("monthsToGenerate: 開始月が未来なら何も入れない", () => {
  assert.deepEqual(recurring.monthsToGenerate({ ...base, start_month: "2026-11-01" }, "2026-10"), []);
});

test("monthsToGenerate: 入れ終わった月の次から（開かなかった月も埋める）", () => {
  const t = { ...base, last_generated_month: "2026-10-01" };
  assert.deepEqual(recurring.monthsToGenerate(t, "2026-10"), []);
  assert.deepEqual(recurring.monthsToGenerate(t, "2027-01"), ["2026-11", "2026-12", "2027-01"]);
});

test("monthsToGenerate: 一時停止中は入れない", () => {
  assert.deepEqual(recurring.monthsToGenerate({ ...base, active: false }, "2026-12"), []);
});

test("lastGeneratedAfterResume: 止めていた月はさかのぼらない", () => {
  const paused = { ...base, active: false, last_generated_month: "2026-10-01" };
  assert.equal(recurring.lastGeneratedAfterResume(paused, "2027-01"), "2026-12");
  const resumed = { ...paused, active: true, last_generated_month: "2026-12-01" };
  assert.deepEqual(recurring.monthsToGenerate(resumed, "2027-01"), ["2027-01"]);
  // 開始前に止めて再開した場合は開始月から
  const notStarted = { ...base, start_month: "2027-03-01", active: false };
  assert.equal(recurring.lastGeneratedAfterResume(notStarted, "2027-01"), null);
  // 今月分を入れ済みなら今月のまま
  assert.equal(recurring.lastGeneratedAfterResume({ ...base, last_generated_month: "2027-01-01" }, "2027-01"), "2027-01");
});

test("validate: 正しい入力", () => {
  const input = { name: "家賃", amount: 80000, day_of_month: 27, start_month: "2026-10", scope: "shared", payer: "me", me_share_amount: null, memo: "" };
  assert.equal(recurring.validate(input), "");
  assert.equal(recurring.validate({ ...input, me_share_amount: 30000 }), "");
  assert.equal(recurring.validate({ ...input, scope: "advance", payer: "partner" }), "");
});

test("validate: 誤った入力", () => {
  const input = { name: "家賃", amount: 80000, day_of_month: 27, start_month: "2026-10", scope: "shared", payer: "me", me_share_amount: null };
  assert.equal(recurring.validate({ ...input, name: "  " }), "NAME_REQUIRED");
  assert.equal(recurring.validate({ ...input, amount: 0 }), "AMOUNT_INVALID");
  assert.equal(recurring.validate({ ...input, amount: -100 }), "AMOUNT_INVALID");
  assert.equal(recurring.validate({ ...input, amount: 10.5 }), "AMOUNT_INVALID");
  assert.equal(recurring.validate({ ...input, amount: "" }), "AMOUNT_INVALID");
  assert.equal(recurring.validate({ ...input, day_of_month: 0 }), "DAY_INVALID");
  assert.equal(recurring.validate({ ...input, day_of_month: 32 }), "DAY_INVALID");
  assert.equal(recurring.validate({ ...input, start_month: "2026-13" }), "START_MONTH_INVALID");
  assert.equal(recurring.validate({ ...input, start_month: "2025-12" }), "START_MONTH_INVALID");
  assert.equal(recurring.validate({ ...input, scope: "mine" }), "SCOPE_PERSONAL");
  assert.equal(recurring.validate({ ...input, me_share_amount: 90000 }), "SPLIT_OUT_OF_RANGE");
  assert.equal(recurring.validate({ ...input, scope: "advance", me_share_amount: 100 }), "SPLIT_OUT_OF_RANGE");
  assert.equal(recurring.validate({ ...input, memo: "あ".repeat(201) }), "MEMO_TOO_LONG");
});

test("transactionFor: 1か月分の支出", () => {
  const tx = recurring.transactionFor({ ...base, day_of_month: 31, category_name: "住居" }, "2026-11");
  assert.equal(tx.date, "2026-11-30");
  assert.equal(tx.amount, 80000);
  assert.equal(tx.recurring_month, "2026-11-01");
  assert.equal(tx.recurring_expense_id, 1);
  assert.equal(tx.status, "confirmed");
  assert.equal(tx.me_share_amount, null);
});
