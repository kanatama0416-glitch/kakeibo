// 明細 ⇄ 立替金（毎月返していく立替）を移す画面操作。
//   ・明細の編集画面「立替金（毎月返す）に移す」
//   ・立替金の編集画面「通常の支出に戻す」→ 費目と分け方を選ぶ画面
// 移す処理（作る → 元を消す → 失敗したら戻す）は lib/move-expense.js。
(function (root) {
  "use strict";

  var Move = root.KakeiboMoveExpense;
  var Split = root.KakeiboSplit;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function yen(value) {
    return "¥" + Math.abs(Number(value) || 0).toLocaleString("ja-JP");
  }

  var VALIDATE_MESSAGES = {
    AMOUNT_NOT_POSITIVE: "返金（マイナスの金額）の明細は立替金に移せません。",
    PAYER_REQUIRED: "払った人が決まっていない明細は立替金に移せません。先に払った人を選んで保存してください。",
    NOT_SAVED: "未送信の明細は移せません。送信が終わってからもう一度お試しください。",
    DATE_REQUIRED: "日付のない明細は移せません。",
    CATEGORY_REQUIRED: "費目を選んでください。",
    NOT_FOUND: "立替金が見つかりませんでした。画面を読み直してください。"
  };

  function errorText(error) {
    var message = String((error && error.message) || "") + " " + String((error && error.details) || "");
    if (message.indexOf("SETTLED_MONTH_LOCKED") !== -1) {
      return "精算済みの月の精算に入っている明細は移せません。先にその月の「支払いを取り消す」を実行してください。";
    }
    if (message.indexOf("REPAYMENT_PRINCIPAL_BELOW_PAID") !== -1) {
      return "すでに返済した合計額より立替金総額が小さくなるため、戻せません。先に該当月の支払済み記録を取り消してください。";
    }
    if (message.indexOf("REPAYMENT_DIRECTION_LOCKED") !== -1) {
      return "返済済み記録があるため、貸し借りの向きが逆転する変更はできません。先に該当月の支払済み記録を取り消してください。";
    }
    return "通信状況を確認して、もう一度お試しください。";
  }

  // 移せなかったときの案内。両方残ったときは、どちらを消せばよいかを伝える。
  function failureMessage(result, labels) {
    if (result.stage === "validate") return VALIDATE_MESSAGES[result.code] || "移せませんでした。";
    if (result.stage === "create") return labels.target + "を作れなかったため、移していません。\n" + errorText(result.error);
    if (result.bothRemain) {
      return labels.target + "は作りましたが、元の" + labels.source + "を消せず、取り消しもできませんでした。\n" +
        "いま両方に同じ内容が入っています。" + labels.source + "の方を開いて削除してください。";
    }
    return labels.source + "を消せなかったため、移していません（作った" + labels.target + "は取り消しました）。\n" + errorText(result.error);
  }

  // options:
  //   db()                kakeiboDb
  //   data()              画面の家計データ
  //   memberName(key) / settings()
  //   isSettledMonth(monthKey) / txSettlementMonth(tx) / monthLabel(monthKey)
  //   operationStartMonth 家計の運用開始月（YYYY-MM）。これより前の日付の明細は精算に入らない
  //   reload()            保存後にデータを読み直して画面を描き直す（Promise）
  //   goTo(screen)        移した先の画面を開く（"transactions" / "money"）
  function create(options) {
    var el = function (id) { return document.getElementById(id); };
    var classifyDialog = el("classifyDialog");
    var initialDialog = el("initialExpenseDialog");
    var moveDialog = el("moveToTransactionDialog");
    if (!classifyDialog || !initialDialog || !moveDialog) return null;

    var amountHolder = el("moveToTransactionAmount");
    var splitEditor = root.KakeiboSplitEditor.create({
      container:el("moveToTransactionSplit"),
      amountInput:amountHolder,
      memberName:options.memberName,
      settings:options.settings
    });
    var busy = false;
    var currentExpense = null;

    function findTransaction(id) {
      var data = options.data();
      return ((data && data.transactions) || []).find(function (x) { return Number(x.id) === Number(id); }) || null;
    }

    function findExpense(id) {
      var data = options.data();
      return ((data && data.initial_expenses) || []).find(function (x) { return Number(x.id) === Number(id); }) || null;
    }

    async function moveTransaction() {
      if (busy) return;
      var tx = findTransaction(el("classifyId").value);
      if (!tx) return;
      var check = Move.initialExpenseFromTransaction(tx);
      if (check.error) {
        alert(VALIDATE_MESSAGES[check.error]);
        return;
      }
      var settlementMonth = options.txSettlementMonth(tx);
      if (options.isSettledMonth(settlementMonth)) {
        alert(options.monthLabel(settlementMonth) + "の精算に入っている明細は移せません。先に" +
          options.monthLabel(settlementMonth) + "の「支払いを取り消す」を実行してください。");
        return;
      }
      var lines = [
        "「" + tx.merchant_name + "」" + yen(tx.amount) + " を立替金（毎月返していく立替）に移しますか？",
        "・明細からは消え、立替・返済画面の立替金に入ります（" + options.memberName(tx.payer) + "が支払い）。",
        "・その月の精算・使い道には入らなくなり、返済の残高に入ります。"
      ];
      if (tx.import_batch_id || tx.source === "csv" || tx.source === "pdf") {
        lines.push("・カード明細から取り込んだ明細です。同じ明細ファイルをもう一度取り込むと、この利用が新しい明細として入り直すので注意してください。");
      }
      if (!window.confirm(lines.join("\n"))) return;

      busy = true;
      try {
        var result = await Move.moveTransactionToInitialExpense(options.db(), tx);
        if (!result.ok) console.error(result.error);
        await options.reload();
        if (!result.ok) {
          alert(failureMessage(result, { source:"明細", target:"立替金" }));
          return;
        }
        classifyDialog.close();
        options.goTo("money");
      } finally {
        busy = false;
      }
    }

    function fillCategoryOptions() {
      var data = options.data();
      var categories = (data && data.categories) || [];
      el("moveToTransactionCategory").innerHTML = categories.map(function (c) {
        return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>';
      }).join("");
    }

    function openMoveToTransaction() {
      var expense = findExpense(el("initialExpenseId").value);
      if (!expense) return;
      currentExpense = expense;
      el("moveToTransactionSummary").textContent =
        expense.item_name + " " + yen(expense.amount) + "（" + String(expense.date || "").replace(/-/g, "/") + "・" +
        options.memberName(expense.payer) + "が支払い）を、明細の支出に戻します。";
      amountHolder.value = String(expense.amount);
      fillCategoryOptions();
      splitEditor.setState({ payer:expense.payer, forWhom:"both", mode:"rate", meAmount:null });
      initialDialog.close();
      moveDialog.showModal();
    }

    async function moveExpense(event) {
      event.preventDefault();
      if (busy || !currentExpense) return;
      var splitError = splitEditor.errorMessage();
      if (splitError) {
        alert(splitError);
        return;
      }
      var fields = Split.toTransactionFields(Number(currentExpense.amount), splitEditor.getState());
      fields.category_name = el("moveToTransactionCategory").value;
      var usedMonth = String(currentExpense.date || "").slice(0, 7);
      if (usedMonth && usedMonth < options.operationStartMonth) {
        var ok = window.confirm(
          "日付が" + options.monthLabel(usedMonth) + "（運用開始の" + options.monthLabel(options.operationStartMonth) + "より前）なので、" +
          "明細に戻すと精算に入らず、立替金の残高からも外れます。\n" +
          "精算に入れたいときは、先に立替金の日付を" + options.monthLabel(options.operationStartMonth) + "以降に直してから戻してください。\n" +
          "このまま戻しますか？"
        );
        if (!ok) return;
      }

      busy = true;
      var button = el("moveToTransactionSaveButton");
      button.disabled = true;
      try {
        var result = await Move.moveInitialExpenseToTransaction(options.db(), currentExpense, fields);
        if (!result.ok) console.error(result.error);
        await options.reload();
        if (!result.ok) {
          alert(failureMessage(result, { source:"立替金", target:"明細" }));
          return;
        }
        moveDialog.close();
        currentExpense = null;
        options.goTo("transactions");
      } finally {
        busy = false;
        button.disabled = false;
      }
    }

    el("moveToInitialExpenseButton").addEventListener("click", moveTransaction);
    el("moveToTransactionButton").addEventListener("click", openMoveToTransaction);
    el("moveToTransactionForm").addEventListener("submit", moveExpense);

    return {};
  }

  root.KakeiboMoveExpenseDialogs = { create:create };
})(typeof self !== "undefined" ? self : this);
