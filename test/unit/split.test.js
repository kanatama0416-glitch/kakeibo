// 分け方（ワリカン式）の単体テスト。実行：node --test test/unit
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var split = require("../../lib/split.js");

var settings = { me_share_percent:50 };

test("誰の分？と払った人から、DBの scope / me_share_amount を決める", function () {
  assert.deepEqual(split.toTransactionFields(5000, { payer:"me", forWhom:"both", mode:"rate" }),
    { scope:"shared", payer:"me", me_share_amount:null });
  assert.deepEqual(split.toTransactionFields(5000, { payer:"me", forWhom:"both", mode:"amount", meAmount:3000 }),
    { scope:"shared", payer:"me", me_share_amount:3000 });
  assert.deepEqual(split.toTransactionFields(5000, { payer:"me", forWhom:"partner" }),
    { scope:"advance", payer:"me", me_share_amount:null });
  assert.deepEqual(split.toTransactionFields(5000, { payer:"partner", forWhom:"partner" }),
    { scope:"partner", payer:"partner", me_share_amount:null });
  assert.deepEqual(split.toTransactionFields(5000, { payer:"me", forWhom:"me" }),
    { scope:"mine", payer:"me", me_share_amount:null });
});

test("保存済みの明細から入力状態に戻せる（往復で変わらない）", function () {
  [
    { scope:"shared", payer:"me", me_share_amount:null },
    { scope:"shared", payer:"partner", me_share_amount:1200 },
    { scope:"advance", payer:"partner", me_share_amount:null },
    { scope:"mine", payer:"me", me_share_amount:null },
    { scope:"partner", payer:"partner", me_share_amount:null }
  ].forEach(function (tx) {
    var state = split.fromTransaction(tx);
    assert.deepEqual(split.toTransactionFields(5000, state), tx);
  });
  assert.equal(split.fromTransaction({ scope:null, payer:"me" }).forWhom, "both");
});

test("金額で分けるときの入力チェック", function () {
  var both = function (me) { return { payer:"me", forWhom:"both", mode:"amount", meAmount:me }; };
  assert.equal(split.validate(5000, both(3000)), "");
  assert.equal(split.validate(5000, both(0)), "");
  assert.equal(split.validate(5000, both(5000)), "");
  assert.equal(split.validate(5000, both(6000)), "SPLIT_OUT_OF_RANGE");
  assert.equal(split.validate(5000, both(-1)), "SPLIT_OUT_OF_RANGE");
  assert.equal(split.validate(5000, both("")), "SPLIT_AMOUNT_REQUIRED");
  assert.equal(split.validate(5000, both(10.5)), "SPLIT_AMOUNT_REQUIRED");
  assert.equal(split.validate(-1000, both(-400)), "");
  assert.equal(split.validate(-1000, both(400)), "SPLIT_OUT_OF_RANGE");
  assert.equal(split.validate(0, both(0)), "AMOUNT_REQUIRED");
  assert.equal(split.validate(5000, { payer:"me", forWhom:"partner" }), "");
});

test("1件で精算が動く額（正：うー → にゃち）", function () {
  assert.equal(split.settlementEffect(5000, { payer:"me", forWhom:"both", mode:"rate" }, settings), 2500);
  assert.equal(split.settlementEffect(5000, { payer:"me", forWhom:"both", mode:"amount", meAmount:3000 }, settings), 2000);
  assert.equal(split.settlementEffect(5000, { payer:"partner", forWhom:"both", mode:"amount", meAmount:3000 }, settings), -3000);
  assert.equal(split.settlementEffect(5000, { payer:"me", forWhom:"partner" }, settings), 5000);
  assert.equal(split.settlementEffect(5000, { payer:"partner", forWhom:"me" }, settings), -5000);
  assert.equal(split.settlementEffect(5000, { payer:"me", forWhom:"me" }, settings), 0);
});
