// 明細 ⇄ 立替金（毎月返していく立替）を、あとから移す処理。画面に依存しない。
// DB は1件ずつしか変えられないので「移す先を作る → 元を消す」の順に行い、元を消せなかったら作った方を消して戻す。
// 戻すのにも失敗したとき（通信が切れた等）は、両方が残ったことを結果で知らせる（画面で片方を消してもらう）。
// db には kakeiboDb（addInitialExpense / deleteInitialExpense / addManualTransaction / deleteTransaction）を渡す。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeiboMoveExpense = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 明細から立替金に移すときの内容。移せない明細はエラーの種類を返す。
  function initialExpenseFromTransaction(tx) {
    if (!tx || tx.pending) return { error:"NOT_SAVED" };
    var amount = Number(tx.amount);
    if (!Number.isInteger(amount) || amount <= 0) return { error:"AMOUNT_NOT_POSITIVE" };
    if (tx.payer !== "me" && tx.payer !== "partner") return { error:"PAYER_REQUIRED" };
    if (!tx.date) return { error:"DATE_REQUIRED" };
    return {
      expense:{
        date:tx.date,
        item_name:String(tx.merchant_name || "").trim() || "立替金",
        amount:amount,
        payer:tx.payer,
        memo:tx.memo || ""
      }
    };
  }

  // 立替金から明細に戻すときの内容。fields は画面で選んだ費目と分け方（category_name / scope / payer / me_share_amount）。
  function transactionFromInitialExpense(expense, fields) {
    if (!expense) return { error:"NOT_FOUND" };
    if (!fields || !fields.category_name) return { error:"CATEGORY_REQUIRED" };
    return {
      tx:{
        date:expense.date,
        merchant_name:String(expense.item_name || "").trim(),
        amount:Number(expense.amount),
        category_name:fields.category_name,
        scope:fields.scope,
        payer:fields.payer,
        me_share_amount:fields.scope === "shared" && fields.me_share_amount != null ? Number(fields.me_share_amount) : null,
        memo:expense.memo || ""
      }
    };
  }

  // 結果：{ ok:true, created } / { ok:false, stage:"create" | "remove", error, bothRemain }
  async function moveWithRollback(create, removeOriginal, undoCreate) {
    var created;
    try {
      created = await create();
    } catch (error) {
      return { ok:false, stage:"create", error:error, bothRemain:false };
    }
    try {
      await removeOriginal();
      return { ok:true, created:created };
    } catch (error) {
      var bothRemain = false;
      try {
        await undoCreate(created);
      } catch (undoError) {
        bothRemain = true;
      }
      return { ok:false, stage:"remove", error:error, bothRemain:bothRemain, created:created };
    }
  }

  async function moveTransactionToInitialExpense(db, tx) {
    var plan = initialExpenseFromTransaction(tx);
    if (plan.error) return { ok:false, stage:"validate", error:new Error(plan.error), code:plan.error, bothRemain:false };
    return moveWithRollback(
      function () { return db.addInitialExpense(plan.expense); },
      function () { return db.deleteTransaction(tx.id); },
      function (created) { return db.deleteInitialExpense(created.id); }
    );
  }

  async function moveInitialExpenseToTransaction(db, expense, fields) {
    var plan = transactionFromInitialExpense(expense, fields);
    if (plan.error) return { ok:false, stage:"validate", error:new Error(plan.error), code:plan.error, bothRemain:false };
    return moveWithRollback(
      function () { return db.addManualTransaction(plan.tx, false, null); },
      function () { return db.deleteInitialExpense(expense.id); },
      function (created) { return db.deleteTransaction(created.id); }
    );
  }

  return {
    initialExpenseFromTransaction:initialExpenseFromTransaction,
    transactionFromInitialExpense:transactionFromInitialExpense,
    moveTransactionToInitialExpense:moveTransactionToInitialExpense,
    moveInitialExpenseToTransaction:moveInitialExpenseToTransaction
  };
});
