// 設定 →「毎月の固定費」の画面（一覧・追加・変更・一時停止・削除）。
// どの月に入れるか・入力チェックは lib/recurring.js、DB への保存は kakeiboDb（supabase-client.js / test/test-db.js）。
// 毎月の支出を入れるのは DB の kakeibo_generate_recurring_expenses()（アプリを開いたとき・保存したとき）。
(function (root) {
  "use strict";

  var Recurring = root.KakeiboRecurring;
  var Split = root.KakeiboSplit;

  var LAST_DAY = 31;

  var ERROR_MESSAGES = {
    NAME_REQUIRED: "名前を入れてください。",
    NAME_TOO_LONG: "名前は100文字以内にしてください。",
    AMOUNT_INVALID: "金額は1円以上の整数で入れてください（1,000万円まで）。",
    DAY_INVALID: "毎月何日かを選んでください。",
    START_MONTH_INVALID: "開始月を選んでください（2026年1月以降）。",
    SCOPE_PERSONAL: "固定費は「ふたり」か相手の分（立替）にしてください。自分だけの支出は家計簿に入れません。",
    PAYER_INVALID: "払った人を選んでください。",
    SPLIT_OUT_OF_RANGE: "負担額は 0 〜 支出額 の範囲にしてください。",
    MEMO_TOO_LONG: "メモは200文字以内にしてください。"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function yen(value) {
    return "¥" + Math.abs(Number(value) || 0).toLocaleString("ja-JP");
  }

  function monthLabel(monthKey) {
    var parts = String(monthKey).slice(0, 7).split("-");
    return Number(parts[0]) + "年" + Number(parts[1]) + "月";
  }

  function dayLabel(day) {
    return Number(day) === LAST_DAY ? "毎月末日" : "毎月" + Number(day) + "日";
  }

  // options:
  //   db()             kakeiboDb
  //   data()           画面の家計データ（categories / recurring_expenses）
  //   memberName(key)  表示名
  //   settings()       負担率の設定
  //   currentMonth()   今月（YYYY-MM、日本時間）
  //   reload()         保存後にデータを読み直して画面を描き直す（Promise）
  function create(options) {
    var el = function (id) { return document.getElementById(id); };
    var listDialog = el("recurringListDialog");
    var formDialog = el("recurringFormDialog");
    var form = el("recurringForm");
    if (!listDialog || !formDialog || !form) return null;

    var amountInput = el("recurringAmount");
    var splitEditor = root.KakeiboSplitEditor.create({
      container: el("recurringSplit"),
      amountInput: amountInput,
      memberName: options.memberName,
      settings: options.settings
    });
    var saving = false;

    function templates() {
      var data = options.data();
      return (data && data.recurring_expenses) || [];
    }

    function findTemplate(id) {
      return templates().find(function (x) { return Number(x.id) === Number(id); }) || null;
    }

    function splitSummary(t) {
      if (t.scope === "advance") {
        return options.memberName(t.payer) + "が" + options.memberName(Split.otherMember(t.payer)) + "の分を立替";
      }
      if (t.me_share_amount != null) {
        return "ふたり " + options.memberName("me") + " " + yen(t.me_share_amount) + " / " +
          options.memberName("partner") + " " + yen(t.amount - t.me_share_amount);
      }
      return options.memberName(t.payer) + "が支払い・ふたり（いつもの割合）";
    }

    function statusLabel(t) {
      if (!t.active) return "一時停止中";
      var start = String(t.start_month).slice(0, 7);
      if (start > options.currentMonth()) return monthLabel(start) + "から";
      return "";
    }

    function renderList(notice) {
      var items = templates();
      el("recurringList").innerHTML = items.length
        ? items.map(function (t) {
            var status = statusLabel(t);
            return '<button type="button" class="merchant-row merchant-row-button recurring-row' +
              (t.active ? "" : " is-paused") + '" data-edit-recurring="' + Number(t.id) + '">' +
              '<div><strong>' + escapeHtml(t.name) + ' ' + yen(t.amount) + '</strong><small>' +
              escapeHtml(dayLabel(t.day_of_month) + " ・ " + (t.category_name || "費目なし") + " ・ " + splitSummary(t)) +
              '</small>' + (status ? '<span class="recurring-status">' + escapeHtml(status) + '</span>' : "") +
              '</div><b>›</b></button>';
          }).join("")
        : '<p class="muted">まだありません。家賃など、毎月同じ額の支出を登録すると毎月自動で明細に入ります。</p>';
      var noticeEl = el("recurringListNotice");
      noticeEl.textContent = notice || "";
      noticeEl.classList.toggle("hidden", !notice);
    }

    function fillCategoryOptions(selected) {
      var data = options.data();
      var categories = (data && data.categories) || [];
      el("recurringCategory").innerHTML = '<option value="">費目なし</option>' +
        categories.map(function (c) {
          return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>';
        }).join("");
      el("recurringCategory").value = selected || "";
    }

    function fillDayOptions(selected) {
      var html = "";
      for (var day = 1; day <= LAST_DAY; day += 1) {
        html += '<option value="' + day + '">' + (day === LAST_DAY ? "末日" : day + "日") + '</option>';
      }
      el("recurringDay").innerHTML = html;
      el("recurringDay").value = String(selected || 1);
    }

    function setFormError(message) {
      var errorEl = el("recurringFormError");
      errorEl.textContent = message || "";
      errorEl.classList.toggle("hidden", !message);
    }

    function openForm(template) {
      var editing = !!template;
      el("recurringFormTitle").textContent = editing ? "固定費を変更" : "固定費を追加";
      el("recurringId").value = editing ? String(template.id) : "";
      el("recurringName").value = editing ? template.name : "";
      amountInput.value = editing ? String(template.amount) : "";
      fillDayOptions(editing ? template.day_of_month : 27);
      fillCategoryOptions(editing ? template.category_name : "");
      var startMonth = el("recurringStartMonth");
      startMonth.value = editing ? String(template.start_month).slice(0, 7) : options.currentMonth();
      startMonth.disabled = editing;
      el("recurringStartMonthHelp").textContent = editing
        ? "開始月は変えられません。変えるときは削除して登録し直してください。"
        : "この月の分から明細に入ります。今月分をもう手入力しているときは来月にしてください。";
      el("recurringActive").checked = editing ? template.active : true;
      el("recurringActiveLabel").classList.toggle("hidden", !editing);
      el("recurringMemo").value = editing ? (template.memo || "") : "";
      el("deleteRecurringButton").classList.toggle("hidden", !editing);
      el("recurringEditNote").classList.toggle("hidden", !editing);
      splitEditor.setState(editing ? Split.fromTransaction(template) : null);
      setFormError("");
      if (listDialog.open) listDialog.close();
      formDialog.showModal();
    }

    function readForm() {
      var amount = Number(amountInput.value);
      var splitState = splitEditor.getState();
      var input = {
        id: el("recurringId").value ? Number(el("recurringId").value) : null,
        name: el("recurringName").value,
        amount: amountInput.value === "" ? "" : amount,
        day_of_month: Number(el("recurringDay").value),
        category_name: el("recurringCategory").value || null,
        start_month: el("recurringStartMonth").value,
        memo: el("recurringMemo").value,
        active: activeValue()
      };
      if (Split.kindOf(splitState) === "personal") {
        input.scope = "personal";
        return { input: input, error: "SCOPE_PERSONAL" };
      }
      var splitError = splitEditor.errorMessage();
      if (splitError && amountInput.value !== "") return { input: input, message: splitError };
      var fields = Split.toTransactionFields(amount, splitState);
      input.scope = fields.scope;
      input.payer = fields.payer;
      input.me_share_amount = fields.me_share_amount;
      return { input: input, error: Recurring.validate(input) };
    }

    function activeValue() {
      return el("recurringId").value ? el("recurringActive").checked : true;
    }

    function generatedNotice(name, count) {
      return count > 0
        ? "「" + name + "」を保存し、" + count + "件を明細に入れました。"
        : "「" + name + "」を保存しました。";
    }

    async function save(event) {
      event.preventDefault();
      if (saving) return;
      var result = readForm();
      var message = result.message || (result.error ? ERROR_MESSAGES[result.error] || "入力を確認してください。" : "");
      if (message) {
        setFormError(message);
        return;
      }
      saving = true;
      var button = el("recurringSaveButton");
      button.disabled = true;
      try {
        var saved = await options.db().saveRecurringExpense(result.input);
        var count = 0;
        var generateFailed = false;
        try {
          count = await options.db().generateRecurringExpenses();
        } catch (error) {
          // 保存はできている。次にアプリを開いたときに入れ直す。
          console.error(error);
          generateFailed = true;
        }
        await options.reload();
        formDialog.close();
        renderList(generateFailed
          ? "「" + saved.name + "」を保存しました。明細への反映は、次にアプリを開いたときに行います。"
          : generatedNotice(saved.name, count));
        listDialog.showModal();
      } catch (error) {
        console.error(error);
        setFormError("保存できませんでした。通信状況を確認して、もう一度お試しください。");
      } finally {
        saving = false;
        button.disabled = false;
      }
    }

    async function remove() {
      var template = findTemplate(el("recurringId").value);
      if (!template || saving) return;
      if (!window.confirm("固定費「" + template.name + "」を削除しますか？\nこれまでに入れた支出は明細に残ります。")) return;
      saving = true;
      try {
        await options.db().deleteRecurringExpense(template.id);
        await options.reload();
        formDialog.close();
        renderList("「" + template.name + "」を削除しました。");
        listDialog.showModal();
      } catch (error) {
        console.error(error);
        setFormError("削除できませんでした。通信状況を確認して、もう一度お試しください。");
      } finally {
        saving = false;
      }
    }

    el("recurringSettingsButton").addEventListener("click", function () {
      renderList("");
      listDialog.showModal();
    });
    el("addRecurringButton").addEventListener("click", function () { openForm(null); });
    el("recurringList").addEventListener("click", function (event) {
      var row = event.target.closest("[data-edit-recurring]");
      if (!row) return;
      openForm(findTemplate(row.getAttribute("data-edit-recurring")));
    });
    form.addEventListener("submit", save);
    el("deleteRecurringButton").addEventListener("click", remove);

    return { renderList: renderList };
  }

  // アプリを開いたときに、まだ入れていない月の固定費を入れる。入れた件数を返す（失敗しても起動は続ける）。
  async function generateOnStart(db) {
    try {
      return await db.generateRecurringExpenses();
    } catch (error) {
      console.error("毎月の固定費を明細に入れられませんでした。", error);
      return 0;
    }
  }

  root.KakeiboRecurringSettings = { create: create, generateOnStart: generateOnStart };
})(typeof self !== "undefined" ? self : this);
