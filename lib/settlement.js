// 月次精算の計算（画面に依存しない）。
// data は supabase-client.js の getInitialData() と同じ形（transactions / carryovers / repayment_plan など）。
// DB側の private.kakeibo_settlement_breakdown() と同じ計算なので、変えるときは両方を直し、
// test/unit/settlement.test.js の期待値（DBで確認した値）も合わせて見直すこと。
(function (root, factory) {
  var api = factory(root.KakeiboCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeiboSettlement = api;
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var monthKeyFromDate = core.monthKeyFromDate;
  var addMonths = core.addMonths;

  var EMPTY_PLAN = {
    id:null, original_amount:0, remaining_amount:0, monthly_amount:0, lender:"me", borrower:"partner"
  };

  function sum(list) {
    return list.reduce(function (total, t) { return total + Number(t.amount || 0); }, 0);
  }

  // 金額を指定して分けた共同支出か（me_share_amount = にゃちの負担額）。
  function hasCustomSplit(t) {
    return t.me_share_amount !== null && t.me_share_amount !== undefined && t.me_share_amount !== "";
  }

  // にゃちの負担額。基本負担率の分は月の合計に対して丸め、金額指定の分はそのまま足す。
  // DB の private.kakeibo_living_current() と同じ計算。
  function myShareOf(shared, settings) {
    var byRate = shared.filter(function (t) { return !hasCustomSplit(t); });
    var custom = shared.filter(hasCustomSplit);
    var customMe = custom.reduce(function (total, t) { return total + Number(t.me_share_amount || 0); }, 0);
    return Math.round(sum(byRate) * core.sharePercent(settings) / 100) + customMe;
  }

  // 明細がどの月の精算に入るか。精算月（settlement_month）がなければ利用日の月。
  // 精算済みの月に後から追加された明細は、DB が次の未精算月を精算月にする。
  function settlementMonthOf(t) {
    return t.settlement_month ? monthKeyFromDate(t.settlement_month) : monthKeyFromDate(t.date);
  }

  function isSettledMonth(settlements, monthKey) {
    return (settlements || []).some(function (x) {
      return monthKeyFromDate(x.settlement_month) === monthKey;
    });
  }

  // 利用日の月から見て、最初の未精算月。DB の private.kakeibo_open_settlement_month() と同じ判定。
  function openSettlementMonth(dateMonth, settlements) {
    var month = dateMonth;
    var guard = 0;
    while (isSettledMonth(settlements, month) && guard < 240) {
      month = addMonths(month, 1);
      guard += 1;
    }
    return month;
  }

  function sharedTransactions(data, monthKey) {
    return (data.transactions || []).filter(function (t) {
      return settlementMonthOf(t) === monthKey &&
        t.scope === "shared" &&
        (t.status === "confirmed" || t.status === "refunded");
    });
  }

  function carryOutRecord(data, category, monthKey) {
    return (data.carryovers || []).find(function (x) {
      return x.category === category && monthKeyFromDate(x.from_month) === monthKey;
    }) || null;
  }

  // 個人間の立替（scope = "advance"）。支払った人が相手の分を全額立て替えた明細。
  function advanceTransactions(data, monthKey) {
    return (data.transactions || []).filter(function (t) {
      return settlementMonthOf(t) === monthKey &&
        t.scope === "advance" &&
        (t.status === "confirmed" || t.status === "refunded");
    });
  }

  // 立替の差し引き。正：うー → にゃちへ支払い / 負：にゃち → うーへ支払い。
  function advanceBreakdown(data, monthKey) {
    var list = advanceTransactions(data, monthKey);
    var byMe = sum(list.filter(function (t) { return t.payer === "me"; }));
    var byPartner = sum(list.filter(function (t) { return t.payer === "partner"; }));
    return { byMe:byMe, byPartner:byPartner, net:byMe - byPartner };
  }

  // 共同費だけの差額。にゃちが払いすぎた額（正）/ 払い足りない額（負）。
  function sharedDifference(data, monthKey) {
    var shared = sharedTransactions(data, monthKey);
    var myShare = myShareOf(shared, data.settings);
    var paidByMe = sum(shared.filter(function (t) { return t.payer === "me"; }));
    return paidByMe - myShare;
  }

  // その月の生活費の精算差額（共同費の差額 + 個人間の立替）。繰越・返済を含まない。
  // DB の private.kakeibo_living_current() と同じ計算。
  function livingCurrent(data, monthKey) {
    return sharedDifference(data, monthKey) + advanceBreakdown(data, monthKey).net;
  }

  // その月から翌月へ実際に繰り越せる額。運用開始月から順に積み上げる。
  function effectiveCarryOutAmount(data, monthKey) {
    if (!monthKey || monthKey < core.OPERATION_START_MONTH) return 0;
    var month = core.OPERATION_START_MONTH;
    var carryIn = 0;
    var carryOut = 0;
    var guard = 0;
    while (month <= monthKey && guard < 240) {
      var settlement = livingCurrent(data, month) + carryIn;
      var record = carryOutRecord(data, "living", month);
      var raw = record ? Number(record.amount || 0) : 0;
      carryOut = (!record || settlement === 0 || !raw || Math.sign(raw) !== Math.sign(settlement))
        ? 0
        : Math.sign(settlement) * Math.min(Math.abs(raw), Math.abs(settlement));
      carryIn = carryOut;
      month = addMonths(month, 1);
      guard += 1;
    }
    return carryOut;
  }

  function carryInAmount(data, monthKey) {
    if (monthKey <= core.OPERATION_START_MONTH) return 0;
    return effectiveCarryOutAmount(data, addMonths(monthKey, -1));
  }

  function repaymentRecord(data, monthKey, plan) {
    return (data.repayments || []).find(function (x) {
      return Number(x.repayment_plan_id) === Number(plan && plan.id) &&
        monthKeyFromDate(x.repayment_month) === monthKey;
    }) || null;
  }

  function repaymentSetting(data, monthKey, plan) {
    return (data.repayment_amounts || []).find(function (x) {
      return Number(x.repayment_plan_id) === Number(plan && plan.id) &&
        monthKeyFromDate(x.repayment_month) === monthKey;
    }) || null;
  }

  function repaymentAmountForMonth(data, monthKey, plan) {
    if (!plan || !plan.id || monthKey < core.REPAYMENT_START_MONTH) return 0;

    var recorded = repaymentRecord(data, monthKey, plan);
    if (recorded) return Number(recorded.amount || 0);

    var setting = repaymentSetting(data, monthKey, plan);
    var monthlyAmount = setting
      ? Math.max(0, Number(setting.amount || 0))
      : Math.max(0, Number(plan.monthly_amount || 0));
    var originalAmount = Math.max(0, Number(plan.original_amount || 0));
    if (!monthlyAmount || !originalAmount) return 0;

    var repaidBefore = sum((data.repayments || []).filter(function (x) {
      return Number(x.repayment_plan_id) === Number(plan.id) &&
        monthKeyFromDate(x.repayment_month) < monthKey;
    }));
    return Math.min(monthlyAmount, Math.max(0, originalAmount - repaidBefore));
  }

  // 正の値：うー → にゃちへ支払い / 負の値：にゃち → うーへ支払い
  function calculateSummary(data, monthKey) {
    // 明細一覧・分析は利用日の月（monthTransactions）、精算は精算月で集計する。
    var monthTransactions = (data.transactions || []).filter(function (t) {
      return monthKeyFromDate(t.date) === monthKey;
    });
    // 精算済みの月に後から追加され、この月の精算に入った明細（利用月はこの月より前）。
    var lateTransactions = (data.transactions || []).filter(function (t) {
      return settlementMonthOf(t) === monthKey && monthKeyFromDate(t.date) < monthKey &&
        (t.scope === "shared" || t.scope === "advance") &&
        (t.status === "confirmed" || t.status === "refunded");
    });
    var shared = sharedTransactions(data, monthKey);
    var total = sum(shared);
    var myShare = myShareOf(shared, data.settings);
    var paidByMe = sum(shared.filter(function (t) { return t.payer === "me"; }));
    var paidByPartner = sum(shared.filter(function (t) { return t.payer === "partner"; }));

    var sharedDiff = paidByMe - myShare;
    var advance = advanceBreakdown(data, monthKey);
    var living = sharedDiff + advance.net;
    var carryIn = carryInAmount(data, monthKey);
    var livingSettlement = living + carryIn;
    var livingCarryOut = effectiveCarryOutAmount(data, monthKey);
    var livingPayNow = livingSettlement - livingCarryOut;

    var plan = data.repayment_plan || EMPTY_PLAN;
    var monthlyRepayment = repaymentAmountForMonth(data, monthKey, plan);
    var repaymentNet = plan.lender === "me" ? monthlyRepayment : -monthlyRepayment;

    return {
      month:monthKey,
      total:total,
      myShare:myShare,
      partnerShare:total - myShare,
      paidByMe:paidByMe,
      paidByPartner:paidByPartner,
      sharedDiff:sharedDiff,
      advanceByMe:advance.byMe,
      advanceByPartner:advance.byPartner,
      advanceNet:advance.net,
      livingCurrent:living,
      carryInLiving:carryIn,
      livingSettlement:livingSettlement,
      livingCarryOut:livingCarryOut,
      livingPayNow:livingPayNow,
      monthlyRepayment:monthlyRepayment,
      repaymentNet:repaymentNet,
      finalSettlement:livingPayNow + repaymentNet,
      plan:plan,
      monthTransactions:monthTransactions,
      lateTransactions:lateTransactions,
      lateTotal:sum(lateTransactions)
    };
  }

  return {
    settlementMonthOf: settlementMonthOf,
    isSettledMonth: isSettledMonth,
    openSettlementMonth: openSettlementMonth,
    hasCustomSplit: hasCustomSplit,
    carryOutRecord: carryOutRecord,
    advanceBreakdown: advanceBreakdown,
    livingCurrent: livingCurrent,
    effectiveCarryOutAmount: effectiveCarryOutAmount,
    carryInAmount: carryInAmount,
    repaymentAmountForMonth: repaymentAmountForMonth,
    calculateSummary: calculateSummary
  };
});
