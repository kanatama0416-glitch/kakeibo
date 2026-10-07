// 支出の「払った人・誰の分？・分け方」を入力する画面部品（支出の追加・明細の編集で共通）。
// 計算と入力チェックは lib/split.js、表示とボタン操作だけをここで受け持つ。
(function (root) {
  "use strict";

  var Split = root.KakeiboSplit;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function yen(value) {
    return "¥" + Math.abs(Number(value) || 0).toLocaleString("ja-JP");
  }

  var ERROR_MESSAGES = {
    AMOUNT_REQUIRED: function () { return "先に金額を入れてください。"; },
    SPLIT_AMOUNT_REQUIRED: function (ctx) { return ctx.name("me") + "の負担額を整数で入れてください。"; },
    SPLIT_OUT_OF_RANGE: function (ctx) {
      return "負担額は 0 〜 " + yen(ctx.amount) + " の範囲で、ふたりの合計が支出額と同じになるようにしてください。";
    }
  };

  // options:
  //   container      部品を描く要素
  //   amountInput    支出額の input（変更を監視して再計算する）
  //   memberName(key) / settings()  表示名と負担率の取得
  //   onChange(state)               入力が変わったとき（店舗ルール欄の切り替えなどに使う）
  function create(options) {
    var container = options.container;
    var amountInput = options.amountInput;
    var state = { payer:"me", forWhom:"both", mode:"rate", meAmount:null };

    function name(key) { return options.memberName(key); }
    function amount() { return Number(amountInput.value || 0); }

    function segmented(group, items, current, label) {
      return '<div class="split-segmented" role="radiogroup" aria-label="' + escapeHtml(label) + '">' +
        items.map(function (item) {
          var active = item.value === current;
          return '<button type="button" role="radio" aria-checked="' + active + '" class="split-option' +
            (active ? " active" : "") + '" data-split-' + group + '="' + item.value + '">' +
            escapeHtml(item.label) + '</button>';
        }).join("") + '</div>';
    }

    function effectText() {
      var kind = Split.kindOf(state);
      if (!amount()) return "金額を入れると、精算への影響がここに出ます。";
      if (kind === "personal") return name(state.payer) + "の個人の支出です。精算・集計には入りません。";
      var effect = Split.settlementEffect(amount(), state, options.settings());
      if (effect === 0) return "この支出で精算は動きません。";
      var from = effect > 0 ? "partner" : "me";
      var to = otherOf(from);
      var prefix = kind === "advance"
        ? name(state.payer) + "が" + name(state.forWhom) + "の分を立て替え → "
        : "";
      return prefix + "精算で " + name(from) + " → " + name(to) + " " + yen(effect);
    }

    function otherOf(key) { return Split.otherMember(key); }

    function render() {
      var kind = Split.kindOf(state);
      var showAmounts = kind === "shared" && state.mode === "amount";
      var meAmount = state.meAmount;
      var partnerAmount = (meAmount === null || meAmount === "" || !Number.isFinite(Number(meAmount)))
        ? ""
        : amount() - Number(meAmount);
      var pct = Math.round(Number(options.settings() && options.settings().me_share_percent));
      if (!Number.isFinite(pct)) pct = 50;
      var error = showAmounts ? Split.validate(amount(), state) : "";

      container.innerHTML =
        '<div class="split-field"><span class="split-label">払った人</span>' +
          segmented("payer", [
            { value:"me", label:name("me") },
            { value:"partner", label:name("partner") }
          ], state.payer, "払った人") +
        '</div>' +
        '<div class="split-field"><span class="split-label">誰の分？</span>' +
          segmented("for", [
            { value:"both", label:"ふたり" },
            { value:"partner", label:name("partner") + "の分" },
            { value:"me", label:name("me") + "の分" }
          ], state.forWhom, "誰の分") +
        '</div>' +
        (kind === "shared"
          ? '<div class="split-field"><span class="split-label">分け方</span>' +
              segmented("mode", [
                { value:"rate", label:"いつもの割合 " + pct + ":" + (100 - pct) },
                { value:"amount", label:"金額で分ける" }
              ], state.mode, "分け方") +
            '</div>'
          : "") +
        (showAmounts
          ? '<div class="split-amounts">' +
              '<label>' + escapeHtml(name("me")) + '<input type="number" step="1" inputmode="numeric" data-split-amount="me" value="' +
                escapeHtml(meAmount === null ? "" : meAmount) + '"></label>' +
              '<label>' + escapeHtml(name("partner")) + '<input type="number" step="1" inputmode="numeric" data-split-amount="partner" value="' +
                escapeHtml(partnerAmount) + '"></label>' +
            '</div>'
          : "") +
        '<p class="split-effect" aria-live="polite">' + escapeHtml(effectText()) + '</p>' +
        (error && amount()
          ? '<p class="split-error" role="alert">' + escapeHtml(ERROR_MESSAGES[error]({ name:name, amount:amount() })) + '</p>'
          : "");

      if (options.onChange) options.onChange(getState());
    }

    // 金額欄の入力中は描き直さず、相手の欄と影響額だけ更新する（入力中のカーソルを保つ）。
    function updateAmountsInPlace(edited) {
      var meInput = container.querySelector('[data-split-amount="me"]');
      var partnerInput = container.querySelector('[data-split-amount="partner"]');
      if (!meInput || !partnerInput) return;
      var value = edited === "me" ? meInput.value : partnerInput.value;
      if (value === "") {
        state.meAmount = null;
        (edited === "me" ? partnerInput : meInput).value = "";
      } else if (edited === "me") {
        state.meAmount = Number(value);
        partnerInput.value = String(amount() - Number(value));
      } else {
        state.meAmount = amount() - Number(value);
        meInput.value = String(state.meAmount);
      }
      var effect = container.querySelector(".split-effect");
      if (effect) effect.textContent = effectText();
      var errorEl = container.querySelector(".split-error");
      var error = Split.validate(amount(), state);
      if (error && amount()) {
        if (!errorEl) {
          errorEl = document.createElement("p");
          errorEl.className = "split-error";
          errorEl.setAttribute("role", "alert");
          container.appendChild(errorEl);
        }
        errorEl.textContent = ERROR_MESSAGES[error]({ name:name, amount:amount() });
      } else if (errorEl) {
        errorEl.remove();
      }
      if (options.onChange) options.onChange(getState());
    }

    container.addEventListener("click", function (event) {
      var button = event.target.closest(".split-option");
      if (!button || !container.contains(button)) return;
      if (button.hasAttribute("data-split-payer")) state.payer = button.getAttribute("data-split-payer");
      if (button.hasAttribute("data-split-for")) state.forWhom = button.getAttribute("data-split-for");
      if (button.hasAttribute("data-split-mode")) {
        state.mode = button.getAttribute("data-split-mode");
        if (state.mode === "amount" && (state.meAmount === null || state.meAmount === "")) {
          state.meAmount = Split.defaultMeAmount(amount(), options.settings());
        }
      }
      render();
    });

    container.addEventListener("input", function (event) {
      var edited = event.target.getAttribute && event.target.getAttribute("data-split-amount");
      if (edited) updateAmountsInPlace(edited);
    });

    // 支出額を変えたら、にゃちの負担額はそのままで相手の額と影響額を更新する。
    amountInput.addEventListener("input", render);

    function getState() {
      return { payer:state.payer, forWhom:state.forWhom, mode:state.mode, meAmount:state.meAmount };
    }

    function setState(next) {
      state = {
        payer:next && next.payer === "partner" ? "partner" : "me",
        forWhom:next && (next.forWhom === "me" || next.forWhom === "partner") ? next.forWhom : "both",
        mode:next && next.mode === "amount" ? "amount" : "rate",
        meAmount:next && next.meAmount !== undefined ? next.meAmount : null
      };
      render();
    }

    // 保存前のチェック。問題があれば利用者向けの文言を返す。
    function errorMessage() {
      var error = Split.validate(amount(), state);
      return error ? ERROR_MESSAGES[error]({ name:name, amount:amount() }) : "";
    }

    render();
    return { getState:getState, setState:setState, render:render, errorMessage:errorMessage };
  }

  root.KakeiboSplitEditor = { create:create };
})(typeof self !== "undefined" ? self : this);
