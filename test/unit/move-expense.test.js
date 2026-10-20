const test = require("node:test");
const assert = require("node:assert/strict");
const move = require("../../lib/move-expense.js");

function fakeDb(options = {}) {
  const calls = [];
  let nextId = 500;
  const fail = (name) => { if (options.fail && options.fail.includes(name)) throw new Error(options.errorMessage || name.toUpperCase() + "_FAILED"); };
  return {
    calls,
    async addInitialExpense(expense) { calls.push(["addInitialExpense", expense]); fail("addInitialExpense"); return { id: ++nextId, ...expense }; },
    async deleteInitialExpense(id) { calls.push(["deleteInitialExpense", id]); fail("deleteInitialExpense"); },
    async addManualTransaction(tx) { calls.push(["addManualTransaction", tx]); fail("addManualTransaction"); return { id: ++nextId, ...tx }; },
    async deleteTransaction(id) { calls.push(["deleteTransaction", id]); fail("deleteTransaction"); }
  };
}

const tx = { id: 10, date: "2026-10-05", merchant_name: "家具", amount: 30000, payer: "me", scope: "shared", memo: "ソファ" };
const expense = { id: 3, date: "2026-10-01", item_name: "引越し代", amount: 50000, payer: "partner", memo: "" };

test("initialExpenseFromTransaction: 明細の内容を引き継ぐ", () => {
  assert.deepEqual(move.initialExpenseFromTransaction(tx).expense, { date: "2026-10-05", item_name: "家具", amount: 30000, payer: "me", memo: "ソファ" });
});

test("initialExpenseFromTransaction: 移せない明細", () => {
  assert.equal(move.initialExpenseFromTransaction({ ...tx, amount: -500 }).error, "AMOUNT_NOT_POSITIVE");
  assert.equal(move.initialExpenseFromTransaction({ ...tx, amount: 0 }).error, "AMOUNT_NOT_POSITIVE");
  assert.equal(move.initialExpenseFromTransaction({ ...tx, payer: null }).error, "PAYER_REQUIRED");
  assert.equal(move.initialExpenseFromTransaction({ ...tx, pending: true }).error, "NOT_SAVED");
  assert.equal(move.initialExpenseFromTransaction(null).error, "NOT_SAVED");
});

test("transactionFromInitialExpense: 選んだ費目・分け方で明細にする", () => {
  const result = move.transactionFromInitialExpense(expense, { category_name: "家具・家電", scope: "shared", payer: "partner", me_share_amount: 20000 });
  assert.deepEqual(result.tx, { date: "2026-10-01", merchant_name: "引越し代", amount: 50000, category_name: "家具・家電", scope: "shared", payer: "partner", me_share_amount: 20000, memo: "" });
  const advance = move.transactionFromInitialExpense(expense, { category_name: "家具・家電", scope: "advance", payer: "partner", me_share_amount: 100 });
  assert.equal(advance.tx.me_share_amount, null);
  assert.equal(move.transactionFromInitialExpense(expense, { scope: "shared", payer: "me" }).error, "CATEGORY_REQUIRED");
});

test("明細 → 立替金：作ってから元を消す", async () => {
  const db = fakeDb();
  const result = await move.moveTransactionToInitialExpense(db, tx);
  assert.equal(result.ok, true);
  assert.deepEqual(db.calls.map((c) => c[0]), ["addInitialExpense", "deleteTransaction"]);
  assert.equal(db.calls[1][1], 10);
});

test("明細 → 立替金：元を消せなければ作った立替金を消して戻す", async () => {
  const db = fakeDb({ fail: ["deleteTransaction"], errorMessage: "SETTLED_MONTH_LOCKED" });
  const result = await move.moveTransactionToInitialExpense(db, tx);
  assert.equal(result.ok, false);
  assert.equal(result.stage, "remove");
  assert.equal(result.bothRemain, false);
  assert.match(result.error.message, /SETTLED_MONTH_LOCKED/);
  assert.deepEqual(db.calls.map((c) => c[0]), ["addInitialExpense", "deleteTransaction", "deleteInitialExpense"]);
  assert.equal(db.calls[2][1], 501);
});

test("明細 → 立替金：戻すのにも失敗したら両方残ったと知らせる", async () => {
  const db = fakeDb({ fail: ["deleteTransaction", "deleteInitialExpense"] });
  const result = await move.moveTransactionToInitialExpense(db, tx);
  assert.equal(result.ok, false);
  assert.equal(result.bothRemain, true);
});

test("明細 → 立替金：作れなければ何も消さない", async () => {
  const db = fakeDb({ fail: ["addInitialExpense"] });
  const result = await move.moveTransactionToInitialExpense(db, tx);
  assert.equal(result.stage, "create");
  assert.deepEqual(db.calls.map((c) => c[0]), ["addInitialExpense"]);
});

test("明細 → 立替金：移せない明細は DB を触らない", async () => {
  const db = fakeDb();
  const result = await move.moveTransactionToInitialExpense(db, { ...tx, amount: -1 });
  assert.equal(result.stage, "validate");
  assert.equal(result.code, "AMOUNT_NOT_POSITIVE");
  assert.equal(db.calls.length, 0);
});

test("立替金 → 明細：作ってから元を消す／消せなければ戻す", async () => {
  const fields = { category_name: "家具・家電", scope: "shared", payer: "partner", me_share_amount: null };
  const ok = fakeDb();
  assert.equal((await move.moveInitialExpenseToTransaction(ok, expense, fields)).ok, true);
  assert.deepEqual(ok.calls.map((c) => c[0]), ["addManualTransaction", "deleteInitialExpense"]);

  const locked = fakeDb({ fail: ["deleteInitialExpense"], errorMessage: "REPAYMENT_PRINCIPAL_BELOW_PAID" });
  const result = await move.moveInitialExpenseToTransaction(locked, expense, fields);
  assert.equal(result.ok, false);
  assert.equal(result.bothRemain, false);
  assert.deepEqual(locked.calls.map((c) => c[0]), ["addManualTransaction", "deleteInitialExpense", "deleteTransaction"]);
});
