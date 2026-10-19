// 毎月の固定費（家賃など）の判定。画面に依存しない。
// どの月に支出を入れるか・何日付にするかは、DB の public.kakeibo_generate_recurring_expenses() と同じ。
// 変えるときは supabase/migrations の関数も同じ計算に直すこと。
(function (root, factory) {
  var api = factory(root.KakeiboCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeiboRecurring = api;
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var MAX_AMOUNT = 10000000;
  var MIN_START_MONTH = "2026-01";
  var MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

  function daysInMonth(monthKey) {
    var parts = monthKey.split("-");
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]), 0)).getUTCDate();
  }

  // その月の支出の日付。31日など月にない日は月末にそろえる。
  function occurrenceDate(monthKey, dayOfMonth) {
    var day = Math.min(Number(dayOfMonth), daysInMonth(monthKey));
    return monthKey + "-" + String(day).padStart(2, "0");
  }

  // まだ支出を入れていない月（開始月〜今月）。一時停止中・開始前は空。
  function monthsToGenerate(template, currentMonth) {
    if (!template || !template.active) return [];
    var start = core.monthKeyFromDate(template.start_month);
    var last = template.last_generated_month ? core.monthKeyFromDate(template.last_generated_month) : null;
    var month = last ? core.addMonths(last, 1) : start;
    if (month < start) month = start;
    var months = [];
    var guard = 0;
    while (month <= currentMonth && guard < 240) {
      months.push(month);
      month = core.addMonths(month, 1);
      guard += 1;
    }
    return months;
  }

  // 一時停止から再開したときに、入れ終わった扱いにする月（止めていた月はさかのぼらない）。
  function lastGeneratedAfterResume(template, currentMonth) {
    var previous = core.addMonths(currentMonth, -1);
    var start = core.monthKeyFromDate(template.start_month);
    var last = template.last_generated_month ? core.monthKeyFromDate(template.last_generated_month) : null;
    if (previous < start) return last;
    return last && last > previous ? last : previous;
  }

  function toInteger(value) {
    if (value === null || value === undefined || value === "") return null;
    var number = Number(value);
    return Number.isFinite(number) && Math.round(number) === number ? number : NaN;
  }

  // 保存前の入力チェック。問題なければ空文字、あればエラーの種類を返す。
  // input: { name, amount, day_of_month, start_month(YYYY-MM), scope, payer, me_share_amount, memo }
  function validate(input) {
    var name = core.normalizeText(input && input.name);
    if (!name) return "NAME_REQUIRED";
    if (name.length > 100) return "NAME_TOO_LONG";
    var amount = toInteger(input.amount);
    if (amount === null || Number.isNaN(amount) || amount <= 0 || amount > MAX_AMOUNT) return "AMOUNT_INVALID";
    var day = toInteger(input.day_of_month);
    if (day === null || Number.isNaN(day) || day < 1 || day > 31) return "DAY_INVALID";
    var start = String(input.start_month || "");
    if (!MONTH_PATTERN.test(start) || start < MIN_START_MONTH) return "START_MONTH_INVALID";
    if (input.scope !== "shared" && input.scope !== "advance") return "SCOPE_PERSONAL";
    if (input.payer !== "me" && input.payer !== "partner") return "PAYER_INVALID";
    if (input.me_share_amount !== null && input.me_share_amount !== undefined) {
      var share = toInteger(input.me_share_amount);
      if (input.scope !== "shared" || share === null || Number.isNaN(share) || share < 0 || share > amount) {
        return "SPLIT_OUT_OF_RANGE";
      }
    }
    if (input.memo && String(input.memo).length > 200) return "MEMO_TOO_LONG";
    return "";
  }

  // 固定費から作る1か月分の支出（DB の生成関数が入れる値と同じ）。
  function transactionFor(template, monthKey) {
    return {
      date: occurrenceDate(monthKey, template.day_of_month),
      merchant_name: template.name,
      amount: Number(template.amount),
      category_name: template.category_name || null,
      scope: template.scope,
      payer: template.payer,
      me_share_amount: template.scope === "shared" && template.me_share_amount != null ? Number(template.me_share_amount) : null,
      status: "confirmed",
      source: "manual",
      memo: template.memo || "",
      recurring_expense_id: template.id,
      recurring_month: monthKey + "-01"
    };
  }

  return {
    MAX_AMOUNT: MAX_AMOUNT,
    occurrenceDate: occurrenceDate,
    monthsToGenerate: monthsToGenerate,
    lastGeneratedAfterResume: lastGeneratedAfterResume,
    validate: validate,
    transactionFor: transactionFor
  };
});
