// 毎月の定額（家賃など）。画面に依存しない判定と計算。
// 本番では DB の public.kakeibo_apply_recurring_expenses() が同じ規則で明細を作る。
// テスト環境（test/test-db.js）と単体テストはこのファイルの関数を使う。
//
// 規則：
//   - 開始月〜今月の各月に1件ずつ明細を作る（運用開始月より前は作らない）。
//   - 作り終えた月（last_generated_month）より後の月だけ作る。明細を削除しても同じ月は作り直さない。
//   - 日付は毎月の指定日。その月に指定日がなければ月末にする（31日指定の2月は28日/29日）。
//   - 停止中（is_active = false）の定額は作らない。
(function (root, factory) {
  var api = factory(root.KakeiboCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeiboRecurring = api;
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

  function monthKey(value) {
    var key = String(value == null ? "" : value).slice(0, 7);
    return MONTH_PATTERN.test(key) ? key : "";
  }

  function daysInMonth(key) {
    var parts = key.split("-");
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]), 0)).getUTCDate();
  }

  // その月の明細の日付（YYYY-MM-DD）。指定日がない月は月末。
  function dateInMonth(key, dayOfMonth) {
    var day = Math.min(Math.max(1, Number(dayOfMonth) || 1), daysInMonth(key));
    return key + "-" + String(day).padStart(2, "0");
  }

  // 今回作る月の一覧（古い順）。currentMonth は "YYYY-MM"。
  function monthsToGenerate(template, currentMonth) {
    var current = monthKey(currentMonth);
    if (!template || template.is_active === false || !current) return [];
    var start = monthKey(template.start_month);
    if (!start) return [];
    if (start < core.OPERATION_START_MONTH) start = core.OPERATION_START_MONTH;
    var last = monthKey(template.last_generated_month);
    if (last && core.addMonths(last, 1) > start) start = core.addMonths(last, 1);
    var months = [];
    for (var key = start; key <= current && months.length < 120; key = core.addMonths(key, 1)) {
      months.push(key);
    }
    return months;
  }

  // 今回作る明細（DB に保存する項目）。
  function transactionsToGenerate(template, currentMonth) {
    return monthsToGenerate(template, currentMonth).map(function (key) {
      var amount = Number(template.amount);
      return {
        recurring_expense_id: template.id,
        recurring_month: key + "-01",
        date: dateInMonth(key, template.day_of_month),
        merchant_name: template.name,
        amount: amount,
        category_name: template.category_name || null,
        scope: template.scope,
        payer: template.payer,
        me_share_amount: template.scope === "shared" && template.me_share_amount != null
          ? Number(template.me_share_amount)
          : null,
        status: amount < 0 ? "refunded" : "confirmed",
        memo: template.memo || null
      };
    });
  }

  function toInteger(value) {
    if (value === null || value === undefined || value === "") return null;
    var number = Number(value);
    return Number.isFinite(number) && Math.round(number) === number ? number : NaN;
  }

  // 入力の誤りを返す（問題なければ空文字）。分け方の検証は lib/split.js が受け持つ。
  function validate(input) {
    if (!input) return "NAME_REQUIRED";
    var name = core.normalizeText(input.name);
    if (!name) return "NAME_REQUIRED";
    if (name.length > 100) return "NAME_TOO_LONG";
    var amount = toInteger(input.amount);
    if (amount === null || Number.isNaN(amount) || amount === 0) return "AMOUNT_REQUIRED";
    if (Math.abs(amount) > 100000000) return "AMOUNT_TOO_LARGE";
    if (!core.normalizeText(input.category_name)) return "CATEGORY_REQUIRED";
    var day = toInteger(input.day_of_month);
    if (day === null || Number.isNaN(day) || day < 1 || day > 31) return "DAY_INVALID";
    var start = monthKey(input.start_month);
    if (!start) return "START_MONTH_INVALID";
    if (start < core.OPERATION_START_MONTH) return "START_MONTH_TOO_EARLY";
    return "";
  }

  // 一覧の補足（例：「毎月27日」「毎月末日」）。
  function scheduleLabel(dayOfMonth) {
    var day = Number(dayOfMonth);
    return day >= 31 ? "毎月末日" : "毎月" + day + "日";
  }

  return {
    dateInMonth: dateInMonth,
    monthsToGenerate: monthsToGenerate,
    transactionsToGenerate: transactionsToGenerate,
    validate: validate,
    scheduleLabel: scheduleLabel
  };
});
