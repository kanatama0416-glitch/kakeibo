// 費目別の集計（明細画面の「費目別」タブ・分析・ホームの使い道で共通）。
// ブラウザでは window.KakeiboCategoryView、Node（単体テスト）では require() で使う。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeiboCategoryView = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 仕分け済みで費目だけがない明細の呼び方（app.js の表示と同じ）。
  var NO_CATEGORY_LABEL = "費目なし";
  var MONTH_PATTERN = /^\d{4}-\d{2}$/;

  // 使い道・分析・費目別の集計対象は共同の生活費だけ。
  // 対象外（個人の買い物）・個人間の立替・未仕分けは含めない（README の運用ルール）。
  function isCategorySpending(tx) {
    return !!tx && (tx.status === "confirmed" || tx.status === "refunded") && tx.scope === "shared";
  }

  function categoryName(tx) {
    return (tx && tx.category_name) || NO_CATEGORY_LABEL;
  }

  function usageMonth(tx) {
    return tx && tx.date ? String(tx.date).slice(0, 7) : "";
  }

  function amountOf(tx) {
    var value = Number(tx && tx.amount);
    return Number.isFinite(value) ? value : 0;
  }

  // 開始月と終了月をそろえる。逆順なら入れ替える。形式が不正なら null。
  function normalizeRange(startMonth, endMonth) {
    var start = String(startMonth || "");
    var end = String(endMonth || "");
    if (!MONTH_PATTERN.test(start) || !MONTH_PATTERN.test(end)) return null;
    return start <= end ? { start:start, end:end } : { start:end, end:start };
  }

  function newestFirst(a, b) {
    var byDate = String(b.date || "").localeCompare(String(a.date || ""));
    return byDate !== 0 ? byDate : Number(b.id || 0) - Number(a.id || 0);
  }

  // 期間内の費目ごとの合計（費目名 → 金額）。費目の選択肢の並び替えに使う。
  function totalsInRange(transactions, startMonth, endMonth) {
    var range = normalizeRange(startMonth, endMonth);
    var totals = {};
    if (!range) return totals;
    (transactions || []).forEach(function (tx) {
      if (!isCategorySpending(tx)) return;
      var month = usageMonth(tx);
      if (month < range.start || month > range.end) return;
      var name = categoryName(tx);
      totals[name] = (totals[name] || 0) + amountOf(tx);
    });
    return totals;
  }

  // 選んだ費目・期間（利用日の月）の明細と合計。月ごとの小計つきで新しい順に並べる。
  function summarize(transactions, options) {
    var opts = options || {};
    var range = normalizeRange(opts.startMonth, opts.endMonth);
    var category = String(opts.category || "");
    var result = { category:category, range:range, total:0, count:0, months:[] };
    if (!range || !category) return result;

    var matched = (transactions || []).filter(function (tx) {
      if (!isCategorySpending(tx) || categoryName(tx) !== category) return false;
      var month = usageMonth(tx);
      return month >= range.start && month <= range.end;
    }).slice().sort(newestFirst);

    var groups = {};
    matched.forEach(function (tx) {
      var month = usageMonth(tx);
      if (!groups[month]) {
        groups[month] = { month:month, total:0, count:0, transactions:[] };
        result.months.push(groups[month]);
      }
      groups[month].total += amountOf(tx);
      groups[month].count += 1;
      groups[month].transactions.push(tx);
      result.total += amountOf(tx);
      result.count += 1;
    });
    return result;
  }

  return {
    NO_CATEGORY_LABEL: NO_CATEGORY_LABEL,
    isCategorySpending: isCategorySpending,
    categoryName: categoryName,
    normalizeRange: normalizeRange,
    totalsInRange: totalsInRange,
    summarize: summarize
  };
});
