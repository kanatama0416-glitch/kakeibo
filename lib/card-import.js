// カード明細取込の判定（画面に依存しない）：登録済み明細との重複判定、カードごとの取込状況。
(function (root, factory) {
  var api = factory(root.KakeiboCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeiboCardImport = api;
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var normalizeMerchant = core.normalizeMerchant;

  var CARD_PROVIDER_LABELS = { rakuten:"楽天カード", epos:"エポスカード" };

  // 登録済み明細の中から、取込行と同じものを探す。
  // claimed：同じファイル内の別の行がすでに対応づけた明細ID。1件の登録済み明細に複数行をぶら下げない。
  function findExistingMatch(transactions, row, claimed) {
    var merchantKey = normalizeMerchant(row.merchant_name);
    var candidates = (transactions || []).filter(function (tx) {
      if (claimed && claimed[tx.id]) return false;
      return core.normalizeText(tx.memo).indexOf("現金") === -1;
    });

    var sameDateAmount = candidates.filter(function (tx) {
      return tx.date === row.date && Number(tx.amount) === Number(row.amount);
    }).sort(function (a, b) {
      var aExact = normalizeMerchant(a.merchant_name) === merchantKey ? 1 : 0;
      var bExact = normalizeMerchant(b.merchant_name) === merchantKey ? 1 : 0;
      return bExact - aExact;
    });

    if (sameDateAmount.length) {
      var hasExactMerchant = sameDateAmount.some(function (tx) {
        return normalizeMerchant(tx.merchant_name) === merchantKey;
      });
      return {
        tx:sameDateAmount[0],
        txs:sameDateAmount,
        reason:hasExactMerchant
          ? "同じ日・金額・利用先の明細があります"
          : "同じ日・同じ金額の明細があります"
      };
    }

    var nearbyMerchant = candidates.filter(function (tx) {
      return Number(tx.amount) === Number(row.amount) &&
        normalizeMerchant(tx.merchant_name) === merchantKey &&
        core.dateDistanceInDays(tx.date, row.date) <= 3;
    }).sort(function (a, b) {
      return core.dateDistanceInDays(a.date, row.date) - core.dateDistanceInDays(b.date, row.date);
    });

    if (nearbyMerchant.length) {
      return {
        tx:nearbyMerchant[0],
        txs:nearbyMerchant,
        reason:"同じ利用先・金額の明細が前後3日以内にあります"
      };
    }

    return null;
  }

  // 取込行の重複判定。row を更新する。
  // ・登録済みの明細と一致 → 重複として外す
  // ・同じファイル内に同じ日・金額・利用先がもう1行ある → 別々の利用として選択したまま注意を出す
  // context は1ファイル分の判定で使い回す { seen:{}, claimed:{} }。
  function applyDuplicateCheck(transactions, row, context, fileLabel) {
    var key = row.date + "|" + row.amount + "|" + normalizeMerchant(row.merchant_name);
    var existing = findExistingMatch(transactions, row, context.claimed);
    if (existing) {
      row.duplicate = true;
      row.selected = false;
      row.matchReason = existing.reason;
      row.matchedTxs = existing.txs || [existing.tx];
      context.claimed[existing.tx.id] = true;
    } else if (context.seen[key]) {
      row.sameFileRepeat = true;
      row.matchReason = (row.matchReason ? row.matchReason + " " : "") +
        "この" + fileLabel + "内に同じ日・金額・利用先の明細がもう1件あります。" +
        "別々の利用として両方登録します（同じものなら外してください）。";
    }
    context.seen[key] = true;
    return row;
  }

  function newDuplicateContext() {
    return { seen:{}, claimed:{} };
  }

  // 毎月明細を取り込むべきカード。登録済みカードがなければ、取込できるカード会社を並べる。
  function expectedImportCards(cards) {
    var list = (cards || []).slice().sort(function (a, b) {
      return Number(a.id) - Number(b.id);
    });
    if (list.length) return list;
    return Object.keys(CARD_PROVIDER_LABELS).map(function (provider) {
      return { id:null, provider:provider, name:CARD_PROVIDER_LABELS[provider], owner:null, last4:null };
    });
  }

  // 指定月分（取込履歴の「何月分」）として取込済みかをカードごとに返す。
  function cardImportStatus(data, monthKey) {
    var cards = data.cards || [];
    var batches = data.import_batches || [];
    function cardById(id) {
      return cards.find(function (card) { return Number(card.id) === Number(id); }) || null;
    }
    return expectedImportCards(cards).map(function (card) {
      var monthBatches = batches.filter(function (batch) {
        if (core.monthKeyFromDate(batch.target_month) !== monthKey) return false;
        if (card.id) return Number(batch.card_id) === Number(card.id);
        var batchCard = cardById(batch.card_id);
        return !!batchCard && batchCard.provider === card.provider;
      });
      return {
        card:card,
        imported:monthBatches.length > 0,
        count:monthBatches.reduce(function (total, batch) {
          return total + Number(batch.imported_count || 0);
        }, 0)
      };
    });
  }

  return {
    CARD_PROVIDER_LABELS: CARD_PROVIDER_LABELS,
    findExistingMatch: findExistingMatch,
    applyDuplicateCheck: applyDuplicateCheck,
    newDuplicateContext: newDuplicateContext,
    expectedImportCards: expectedImportCards,
    cardImportStatus: cardImportStatus
  };
});
