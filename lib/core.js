// 画面に依存しない共通処理（月の計算・文字の正規化など）。
// ブラウザでは window.KakeiboCore、Node（単体テスト）では require() で使う。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeiboCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OPERATION_START_MONTH = "2026-10";
  var REPAYMENT_START_MONTH = "2026-10";

  function monthKeyFromDate(value) {
    return value ? String(value).slice(0, 7) : "";
  }

  function addMonths(monthKey, offset) {
    var parts = monthKey.split("-");
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1 + offset, 1));
    return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
  }

  function dateDistanceInDays(a, b) {
    var aTime = Date.parse(a + "T00:00:00Z");
    var bTime = Date.parse(b + "T00:00:00Z");
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return 999;
    return Math.abs(aTime - bTime) / 86400000;
  }

  function normalizeText(value) {
    var text = String(value == null ? "" : value);
    try { text = text.normalize("NFKC"); } catch (e) {}
    return text.trim();
  }

  function normalizeMerchant(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[\s　]/g, "")
      .replace(/[・･._\-—–ー\/\\（）()［\]\[\]「」『』]/g, "");
  }

  // 共同費の基本負担率（にゃち側）。不正な値は 50% として扱う。
  function sharePercent(settings) {
    var value = settings ? Number(settings.me_share_percent) : 50;
    if (!Number.isFinite(value) || value < 0 || value > 100) return 50;
    return Math.round(value);
  }

  return {
    OPERATION_START_MONTH: OPERATION_START_MONTH,
    REPAYMENT_START_MONTH: REPAYMENT_START_MONTH,
    monthKeyFromDate: monthKeyFromDate,
    addMonths: addMonths,
    dateDistanceInDays: dateDistanceInDays,
    normalizeText: normalizeText,
    normalizeMerchant: normalizeMerchant,
    sharePercent: sharePercent
  };
});
