// 精算計算の単体テスト。実行：node --test test/unit
// 「同じデータでDB（private.kakeibo_settlement_breakdown）と一致する」ことを確かめた値を期待値にしている。
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var settlement = require("../../lib/settlement.js");

function tx(id, date, amount, payer, extra) {
  return Object.assign({
    id:id, date:date, merchant_name:"店" + id, amount:amount,
    category_name:"食費", scope:"shared", payer:payer, status:"confirmed", source:"manual"
  }, extra || {});
}

function baseData() {
  return {
    settings:{ id:1, me_share_percent:50 },
    transactions:[
      tx(1, "2026-10-03", 10001, "me"),
      tx(2, "2026-10-05", 3333, "partner"),
      tx(3, "2026-10-06", -500, "partner", { status:"refunded" }),
      tx(4, "2026-10-07", 7777, "me", { status:"unclassified", scope:null, category_name:null }),
      tx(5, "2026-10-08", 999, "me", { scope:"mine" }),
      tx(6, "2026-11-02", 1234, "me"),
      tx(7, "2026-11-03", 9876, "partner"),
      tx(8, "2026-12-01", 555, "partner")
    ],
    carryovers:[{ id:1, from_month:"2026-10-01", to_month:"2026-11-01", category:"living", amount:2000 }],
    repayment_plan:{ id:2, original_amount:92185, remaining_amount:92185, monthly_amount:5000, lender:"me", borrower:"partner" },
    repayment_amounts:[
      { id:2, repayment_plan_id:2, repayment_month:"2026-10-01", amount:5000 },
      { id:3, repayment_plan_id:2, repayment_month:"2026-11-01", amount:3000 }
    ],
    repayments:[]
  };
}

test("DBの再計算と同じ精算額になる（10〜12月）", function () {
  var data = baseData();
  assert.equal(settlement.calculateSummary(data, "2026-10").finalSettlement, 6584);
  assert.equal(settlement.calculateSummary(data, "2026-11").finalSettlement, 679);
  assert.equal(settlement.calculateSummary(data, "2026-12").finalSettlement, 4722);
});

test("未分類・対象外の明細は精算に入らず、返金は差し引かれる", function () {
  var summary = settlement.calculateSummary(baseData(), "2026-10");
  assert.equal(summary.total, 10001 + 3333 - 500);
  assert.equal(summary.paidByMe, 10001);
  assert.equal(summary.paidByPartner, 3333 - 500);
});

test("負担額の端数は JS の Math.round と同じ（.5 は切り上げ、負の .5 は 0 側）", function () {
  var data = baseData();
  data.transactions = [tx(1, "2026-12-01", 555, "partner")];
  assert.equal(settlement.calculateSummary(data, "2026-12").myShare, 278);
  data.transactions = [tx(1, "2026-12-01", -555, "partner", { status:"refunded" })];
  assert.equal(settlement.calculateSummary(data, "2026-12").myShare, -277);
});

test("繰越は精算額と同じ向きのときだけ、精算額を上限に効く", function () {
  var data = baseData();
  data.carryovers[0].amount = 99999;
  var october = settlement.calculateSummary(data, "2026-10");
  assert.equal(october.livingCarryOut, october.livingSettlement);
  assert.equal(october.livingPayNow, 0);

  data.carryovers[0].amount = -2000;
  assert.equal(settlement.calculateSummary(data, "2026-10").livingCarryOut, 0);
  assert.equal(settlement.carryOutRecord(data, "living", "2026-10").amount, -2000);
});

test("返済額は残高を超えず、記録済みの返済があればその額を使う", function () {
  var data = baseData();
  data.repayment_plan.original_amount = 4000;
  assert.equal(settlement.repaymentAmountForMonth(data, "2026-10", data.repayment_plan), 4000);

  data.repayments = [{ id:1, repayment_plan_id:2, repayment_month:"2026-10-01", amount:1234 }];
  assert.equal(settlement.repaymentAmountForMonth(data, "2026-10", data.repayment_plan), 1234);
  assert.equal(settlement.repaymentAmountForMonth(data, "2026-11", data.repayment_plan), 2766);
});

test("運用開始前の月と返済計画なしは0円", function () {
  var data = baseData();
  assert.equal(settlement.repaymentAmountForMonth(data, "2026-09", data.repayment_plan), 0);
  assert.equal(settlement.effectiveCarryOutAmount(data, "2026-09"), 0);
  data.repayment_plan = null;
  var summary = settlement.calculateSummary(data, "2026-10");
  assert.equal(summary.monthlyRepayment, 0);
  assert.equal(summary.plan.lender, "me");
});

test("負担率の設定が不正なら 50% として計算する", function () {
  var data = baseData();
  data.settings = { me_share_percent:150 };
  assert.equal(settlement.calculateSummary(data, "2026-11").myShare, 5555);
});

test("個人間の立替は全額が精算に入り、共同費の合計・負担額には入らない", function () {
  var data = baseData();
  data.transactions = data.transactions.concat([
    tx(9, "2026-10-10", 4000, "me", { scope:"advance" }),
    tx(10, "2026-10-12", 1500, "partner", { scope:"advance" }),
    tx(11, "2026-10-14", 800, "me", { scope:"advance", status:"unclassified" })
  ]);
  var oct = settlement.calculateSummary(data, "2026-10");
  assert.equal(oct.total, 10001 + 3333 - 500);
  assert.equal(oct.myShare, settlement.calculateSummary(baseData(), "2026-10").myShare);
  assert.equal(oct.advanceByMe, 4000);
  assert.equal(oct.advanceByPartner, 1500);
  assert.equal(oct.advanceNet, 2500);
  assert.equal(oct.livingCurrent, oct.sharedDiff + 2500);
  assert.equal(oct.finalSettlement, 6584 + 2500);
  // 翌月以降は変わらない（繰越 2,000 円はそのまま）
  assert.equal(settlement.calculateSummary(data, "2026-11").finalSettlement, 679);
  assert.equal(settlement.calculateSummary(data, "2026-12").finalSettlement, 4722);
});

test("うーが立て替えた分だけの月は、にゃちが払う向き（負）になる", function () {
  var data = baseData();
  data.transactions = [tx(1, "2026-12-03", 3000, "partner", { scope:"advance" })];
  var dec = settlement.calculateSummary(data, "2026-12");
  assert.equal(dec.total, 0);
  assert.equal(dec.sharedDiff, 0);
  assert.equal(dec.advanceNet, -3000);
  assert.equal(dec.livingSettlement, -3000);
});
