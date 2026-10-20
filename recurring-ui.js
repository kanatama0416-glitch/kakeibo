// 設定 > 毎月の定額（家賃など）の画面部品。一覧・追加・変更・停止・削除を受け持つ。
// 判定と計算は lib/recurring.js、払った人・誰の分？・分け方の入力は split-editor.js、
// DB へのアクセスは window.kakeiboDb（supabase-client.js / test/test-db.js）を使う。
(function (root) {
  "use strict";

  var Recurring = root.KakeiboRecurring;
  var Split = root.KakeiboSplit;

  var ERROR_MESSAGES = {
    NAME_REQUIRED: "内容を入力してください。",
    NAME_TOO_LONG: "内容は100文字以内で入力してください。",
    AMOUNT_REQUIRED: "金額は0円以外の整数で入力してください。",
    AMOUNT_TOO_LARGE: "金額が大きすぎます。",
    CATEGORY_REQUIRED: "費目を選んでください。",
    DAY_INVALID: "毎月の日付を選んでください。",
    START_MONTH_INVALID: "開始月を選んでください。",
    START_MONTH_TOO_EARLY: "開始月は運用開始月以降にしてください。"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function yen(value) {
    var number = Number(value) || 0;
    return (number < 0 ? "-" : "") + "¥" + Math.abs(number).toLocaleString("ja-JP");
  }

  // options:
  //   getData()            画面のデータ（categories / recurring_expenses / settings）
  //   memberName(key)      表示名
  //   categoryIcon(name)   費目の絵文字
  //   currentMonth()       今月（"YYYY-MM"）。開始月の初期値に使う
  //   minMonth             開始月の下限（運用開始月）
  //   afterChange()        保存・削除の後（定額の明細づくりと読み直し・再描画）
  function create(options) {
    var listDialog = document.getElementById("recurringDialog");
    var list = document.getElementById("recurringList");
    var editDialog = document.getElementById("recurringEditDialog");
    var form = document.getElementById("recurringForm");
    var fields = {
      id: document.getElementById("recurringId"),
      title: document.getElementById("recurringFormTitle"),
      name: document.getElementById("recurringName"),
      amount: document.getElementById("recurringAmount"),
      category: document.getElementById("recurringCategory"),
      day: document.getElementById("recurringDay"),
      startMonth: document.getElementById("recurringStartMonth"),
      memo: document.getElementById("recurringMemo"),
      active: document.getElementById("recurringActive"),
      activeRow: document.getElementById("recurringActiveRow"),
      editNote: document.getElementById("recurringEditNote"),
      deleteButton: document.getElementById("deleteRecurringButton")
    };

    var splitEditor = root.KakeiboSplitEditor.create({
      container: document.getElementById("recurringSplit"),
      amountInput: fields.amount,
      memberName: options.memberName,
      settings: function () { var data = options.getData(); return (data && data.settings) || null; }
    });

    var dayOptions = [];
    for (var day = 1; day <= 30; day++) dayOptions.push('<option value="' + day + '">' + day + '日</option>');
    dayOptions.push('<option value="31">月末</option>');
    fields.day.innerHTML = dayOptions.join("");
    fields.startMonth.min = options.minMonth;

    function templates() {
      var data = options.getData();
      return (data && data.recurring_expenses) || [];
    }

    function findTemplate(id) {
      return templates().find(function (x) { return Number(x.id) === Number(id); }) || null;
    }

    function splitSummary(template) {
      var kind = template.scope === "advance" ? "advance" : (template.scope === "shared" ? "shared" : "personal");
      var payer = options.memberName(template.payer);
      if (kind === "advance") return payer + "が立替";
      if (kind === "personal") return payer + "の個人分（精算に入らない）";
      if (template.me_share_amount != null) {
        return payer + "払い ・ " + options.memberName("me") + " " + yen(template.me_share_amount) + " / " +
          options.memberName("partner") + " " + yen(Number(template.amount) - Number(template.me_share_amount));
      }
      return payer + "払い ・ いつもの割合";
    }

    function renderList() {
      if (!list) return;
      var rows = templates();
      list.innerHTML = rows.length
        ? rows.map(function (template) {
            return '<button type="button" class="transaction-row transaction-edit-row recurring-row' +
              (template.is_active ? '' : ' is-paused') + '" data-recurring-edit="' + Number(template.id) + '">' +
              '<div class="tx-icon">' + escapeHtml(options.categoryIcon(template.category_name)) + '</div>' +
              '<div class="tx-main"><strong>' + escapeHtml(template.name) + '</strong><small>' +
                escapeHtml((template.is_active ? "" : "停止中 ・ ") + Recurring.scheduleLabel(template.day_of_month) + " ・ " +
                  (template.category_name || "費目なし") + " ・ " + splitSummary(template)) +
              '</small></div>' +
              '<div class="tx-side"><div class="tx-amount">' + yen(template.amount) + '</div>' +
              '<span class="tx-edit-label">編集 ›</span></div></button>';
          }).join("")
        : '<p class="muted">まだ登録がありません。家賃など、毎月同じ金額の支出を登録できます。</p>';
    }

    function fillCategories(selected) {
      var data = options.getData();
      var categories = (data && data.categories) || [];
      fields.category.innerHTML = '<option value="">選んでください</option>' + categories.map(function (c) {
        return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml((c.icon ? c.icon + " " : "") + c.name) + '</option>';
      }).join("");
      fields.category.value = selected || "";
    }

    function openEditor(template) {
      form.reset();
      fields.id.value = template ? template.id : "";
      fields.title.textContent = template ? "毎月の定額を変更" : "毎月の定額を追加";
      fields.name.value = template ? template.name : "";
      fields.amount.value = template ? template.amount : "";
      fillCategories(template && template.category_name);
      fields.day.value = String(template ? template.day_of_month : 27);
      var start = template ? String(template.start_month).slice(0, 7) : options.currentMonth();
      fields.startMonth.value = start < options.minMonth ? options.minMonth : start;
      fields.memo.value = template && template.memo ? template.memo : "";
      fields.active.checked = template ? template.is_active : true;
      fields.activeRow.classList.toggle("hidden", !template);
      fields.editNote.classList.toggle("hidden", !template);
      fields.deleteButton.classList.toggle("hidden", !template);
      splitEditor.setState(template ? Split.fromTransaction(template) : { payer:"me", forWhom:"both", mode:"rate" });
      editDialog.showModal();
    }

    function readInput() {
      var amount = Number(fields.amount.value);
      var splitFields = Split.toTransactionFields(amount, splitEditor.getState());
      return {
        id: Number(fields.id.value || 0) || null,
        name: fields.name.value.trim(),
        amount: fields.amount.value === "" ? null : amount,
        category_name: fields.category.value,
        day_of_month: Number(fields.day.value),
        start_month: fields.startMonth.value,
        memo: fields.memo.value.trim(),
        is_active: fields.id.value ? fields.active.checked : true,
        scope: splitFields.scope,
        payer: splitFields.payer,
        me_share_amount: splitFields.me_share_amount
      };
    }

    var saving = false;
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (saving) return;
      var input = readInput();
      var error = Recurring.validate(input);
      var message = error ? ERROR_MESSAGES[error] : splitEditor.errorMessage();
      if (message) { alert(message); return; }

      var button = event.submitter;
      saving = true;
      if (button) button.disabled = true;
      try {
        await root.kakeiboDb.saveRecurringExpense(input);
        editDialog.close();
        await options.afterChange();
        renderList();
      } catch (saveError) {
        console.error(saveError);
        alert("毎月の定額を保存できませんでした。通信状況を確認して、もう一度お試しください。");
      } finally {
        saving = false;
        if (button) button.disabled = false;
      }
    });

    fields.deleteButton.addEventListener("click", async function () {
      var template = findTemplate(fields.id.value);
      if (!template || saving) return;
      if (!root.confirm("「" + template.name + "」を削除しますか？\nすでに明細に入った分は残ります。")) return;
      saving = true;
      try {
        await root.kakeiboDb.deleteRecurringExpense(template.id);
        editDialog.close();
        await options.afterChange();
        renderList();
      } catch (deleteError) {
        console.error(deleteError);
        alert("毎月の定額を削除できませんでした。");
      } finally {
        saving = false;
      }
    });

    list.addEventListener("click", function (event) {
      var row = event.target.closest("[data-recurring-edit]");
      if (!row) return;
      var template = findTemplate(row.getAttribute("data-recurring-edit"));
      if (template) openEditor(template);
    });

    document.getElementById("recurringAddButton").addEventListener("click", function () {
      openEditor(null);
    });

    function open() {
      renderList();
      listDialog.showModal();
    }

    return { open: open, renderList: renderList };
  }

  root.KakeiboRecurringUi = { create: create };
})(typeof self !== "undefined" ? self : this);
