// 1件の支出の「分け方」（ワリカン式）。画面に依存しない。
// 画面では「払った人」「誰の分？」「分け方」で入力し、DB には scope / payer / me_share_amount で保存する。
//   誰の分？ = both（ふたり）   → scope = shared。分け方 rate はいつもの割合、amount は me_share_amount を保存
//   誰の分？ = 払った人と別の人 → scope = advance（立替。相手が全額負担）
//   誰の分？ = 払った人と同じ人 → scope = mine / partner（対象外。精算・集計に入らない）
(function (root, factory) {
  var api = factory(root.KakeiboCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeiboSplit = api;
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var MEMBERS = ["me", "partner"];

  function otherMember(key) {
    return key === "partner" ? "me" : "partner";
  }

  function normalizePayer(payer) {
    return payer === "partner" ? "partner" : "me";
  }

  function toInteger(value) {
    if (value === null || value === undefined || value === "") return null;
    var number = Number(value);
    return Number.isFinite(number) && Math.round(number) === number ? number : NaN;
  }

  // 保存済みの明細から入力状態を作る。未分類（scope なし）は「ふたり・いつもの割合」から始める。
  function fromTransaction(tx) {
    var payer = normalizePayer(tx && tx.payer);
    var scope = tx && tx.scope;
    var state = { payer:payer, forWhom:"both", mode:"rate", meAmount:null };
    if (scope === "advance") {
      state.forWhom = otherMember(payer);
    } else if (scope === "mine" || scope === "partner") {
      state.forWhom = payer;
    } else if (scope === "shared" && tx.me_share_amount !== null && tx.me_share_amount !== undefined) {
      state.mode = "amount";
      state.meAmount = Number(tx.me_share_amount);
    }
    return state;
  }

  function kindOf(state) {
    if (!state || state.forWhom === "both") return "shared";
    return state.forWhom === normalizePayer(state.payer) ? "personal" : "advance";
  }

  // 入力の誤りを返す（問題なければ空文字）。amount は支出額。
  function validate(amount, state) {
    var total = toInteger(amount);
    if (total === null || Number.isNaN(total) || total === 0) return "AMOUNT_REQUIRED";
    if (kindOf(state) !== "shared" || state.mode !== "amount") return "";
    var me = toInteger(state.meAmount);
    if (me === null || Number.isNaN(me)) return "SPLIT_AMOUNT_REQUIRED";
    if (me < Math.min(0, total) || me > Math.max(0, total)) return "SPLIT_OUT_OF_RANGE";
    return "";
  }

  // DB に保存する値。validate() を通した入力だけを渡すこと。
  function toTransactionFields(amount, state) {
    var payer = normalizePayer(state && state.payer);
    var kind = kindOf(state);
    if (kind === "advance") return { scope:"advance", payer:payer, me_share_amount:null };
    if (kind === "personal") return { scope:payer === "partner" ? "partner" : "mine", payer:payer, me_share_amount:null };
    return {
      scope:"shared",
      payer:payer,
      me_share_amount:state.mode === "amount" ? toInteger(state.meAmount) : null
    };
  }

  // この1件で精算が動く額。正：うー → にゃち / 負：にゃち → うー。
  // いつもの割合の分は月の合計で丸めるため、月の精算額とは1円ずれることがある。
  function settlementEffect(amount, state, settings) {
    var total = toInteger(amount);
    if (total === null || Number.isNaN(total)) return 0;
    var payer = normalizePayer(state && state.payer);
    var kind = kindOf(state);
    if (kind === "personal") return 0;
    if (kind === "advance") return payer === "me" ? total : -total;
    var paidByMe = payer === "me" ? total : 0;
    var myShare = state.mode === "amount"
      ? (toInteger(state.meAmount) || 0)
      : Math.round(total * core.sharePercent(settings) / 100);
    return paidByMe - myShare;
  }

  // 金額指定に切り替えたときの初期値（いつもの割合で分けた額）。
  function defaultMeAmount(amount, settings) {
    var total = toInteger(amount);
    if (total === null || Number.isNaN(total)) return 0;
    return Math.round(total * core.sharePercent(settings) / 100);
  }

  return {
    MEMBERS: MEMBERS,
    otherMember: otherMember,
    fromTransaction: fromTransaction,
    kindOf: kindOf,
    validate: validate,
    toTransactionFields: toTransactionFields,
    settlementEffect: settlementEffect,
    defaultMeAmount: defaultMeAmount
  };
});
