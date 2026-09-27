(function () {
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

  function monthLabel(monthKey) {
    var parts = monthKey.split("-");
    return Number(parts[1]) + "月";
  }

  function fullMonthLabel(monthKey) {
    var parts = monthKey.split("-");
    return Number(parts[0]) + "年" + Number(parts[1]) + "月";
  }

  function monthPeriodLabel(monthKey) {
    var parts = monthKey.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return month + "/1〜" + month + "/" + lastDay;
  }

  function actualMonthKey() {
    var now = new Date();
    var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 7);
  }

  function maxSelectableMonth() {
    var actual = actualMonthKey();
    return actual < OPERATION_START_MONTH ? OPERATION_START_MONTH : actual;
  }

  function defaultMonthKey() {
    var key = actualMonthKey();
    return key < OPERATION_START_MONTH ? OPERATION_START_MONTH : key;
  }

  function earliestAvailableMonth() {
    return OPERATION_START_MONTH;
  }

  var state = {
    data: null,
    filter: "all",
    currentClassifyId: null,
    csvRows: [],
    importFileType: "csv",
    started: false,
    currentMonth: defaultMonthKey()
  };

  function yen(value) {
    var number = Number(value || 0);
    return (number < 0 ? "-¥" : "¥") + Math.abs(number).toLocaleString("ja-JP");
  }

  function shortDate(value) {
    if (!value) return "";
    var p = value.split("-");
    return Number(p[1]) + "/" + Number(p[2]);
  }

  function scopeLabel(scope) {
    return scope === "shared" ? "共同" : scope === "mine" ? "にゃち個人" : scope === "partner" ? "うー個人" : "未設定";
  }

  function payerLabel(payer) {
    return payer === "me" ? "にゃち" : payer === "partner" ? "うー" : "未設定";
  }

  function currentMeSharePercent() {
    var settings = state.data && state.data.settings ? state.data.settings : null;
    var value = settings ? Number(settings.me_share_percent) : 50;
    if (!Number.isFinite(value) || value < 0 || value > 100) return 50;
    return Math.round(value);
  }

  function iconFor(tx) {
    var map = { "食費":"🛒", "日用品":"🧴", "光熱費":"💡", "外食":"☕", "家具・家電":"🪑" };
    if (tx.status === "refunded" || Number(tx.amount || 0) < 0) return "↩";
    return map[tx.category_name] || (tx.status === "unclassified" ? "?" : "•");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (m) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m];
    });
  }

  function auditActorLabel(log) {
    var email = String((log && log.actor_email) || "").toLowerCase();
    if (email === "kanatama0416@gmail.com") return "にゃち";
    if (email === "ryu.uver.111@gmail.com") return "うー";
    return email || "システム";
  }

  function auditActionLabel(action) {
    return action === "INSERT" ? "追加" : action === "DELETE" ? "削除" : "変更";
  }

  function auditTableLabel(tableName) {
    var labels = {
      transactions:"支出明細",
      categories:"費目",
      merchant_rules:"店舗ルール",
      loans:"貸し借り",
      repayment_plans:"返済計画",
      repayments:"返済記録",
      initial_expenses:"立替金",
      monthly_carryovers:"翌月への繰越",
      app_settings:"共同費の基本負担",
      monthly_settlements:"支払い済み記録",
      monthly_repayment_amounts:"月ごとの返済額"
    };
    return labels[tableName] || tableName || "データ";
  }

  function auditFieldLabel(field) {
    var labels = {
      transaction_date:"日付",
      expense_date:"日付",
      repayment_date:"返済日",
      repayment_month:"返済月",
      settlement_month:"精算月",
      from_month:"繰越元の月",
      to_month:"繰越先の月",
      merchant_name:"利用先",
      item_name:"項目名",
      description:"内容",
      title:"名称",
      amount:"金額",
      original_amount:"元の金額",
      remaining_amount:"残額",
      monthly_amount:"毎月の返済額",
      me_share_percent:"にゃちの負担割合",
      category_id:"費目",
      category:"区分",
      scope:"支出区分",
      payer:"支払った人",
      lender:"立て替えた人",
      borrower:"返す人",
      status:"状態",
      mode:"処理",
      memo:"メモ",
      paid_at:"支払日時",
      source:"取込元",
      card_provider:"カード会社",
      card_label:"カード名"
    };
    return labels[field] || field;
  }

  function auditPersonValue(value) {
    return value === "me" ? "にゃち" : value === "partner" ? "うー" : value;
  }

  function auditValueLabel(field, value) {
    if (value == null || value === "") return "なし";
    if (["amount","original_amount","remaining_amount","monthly_amount"].indexOf(field) !== -1) {
      return yen(value);
    }
    if (field === "me_share_percent") return String(value) + "%";
    if (["payer","lender","borrower"].indexOf(field) !== -1) return auditPersonValue(value);
    if (field === "scope") return scopeLabel(value);
    if (field === "status") {
      return value === "confirmed" ? "確定" : value === "unclassified" ? "未分類" : value === "refunded" ? "返金" : String(value);
    }
    if (field === "mode") return value === "auto" ? "自動分類" : value === "confirm" ? "毎回確認" : String(value);
    if (typeof value === "boolean") return value ? "はい" : "いいえ";
    return String(value);
  }

  function auditRecordLabel(log) {
    var row = log.action === "DELETE" ? (log.before_data || {}) : (log.after_data || log.before_data || {});
    if (log.table_name === "transactions") {
      return (row.merchant_name || "支出") + (row.amount != null ? " " + yen(row.amount) : "");
    }
    if (log.table_name === "initial_expenses") {
      return (row.item_name || "立替金") + (row.amount != null ? " " + yen(row.amount) : "");
    }
    if (log.table_name === "categories") return row.name || "費目";
    if (log.table_name === "merchant_rules") return row.merchant_name || "店舗ルール";
    if (log.table_name === "repayment_plans") return row.title || "返済計画";
    if (log.table_name === "monthly_repayment_amounts") {
      return (row.repayment_month ? fullMonthLabel(String(row.repayment_month).slice(0,7)) : "月ごと") + "の返済額";
    }
    if (log.table_name === "monthly_carryovers") {
      return (row.from_month ? fullMonthLabel(String(row.from_month).slice(0,7)) : "") + "の繰越";
    }
    if (log.table_name === "monthly_settlements") {
      return (row.settlement_month ? fullMonthLabel(String(row.settlement_month).slice(0,7)) : "") + "の支払い";
    }
    if (log.table_name === "repayments") {
      return (row.repayment_month ? fullMonthLabel(String(row.repayment_month).slice(0,7)) : "") + "の返済";
    }
    if (log.table_name === "app_settings") return "共同費の基本負担";
    if (log.table_name === "loans") return row.description || "貸し借り";
    return "ID " + (log.record_id || "-");
  }

  function auditChangedDetail(log) {
    if (log.action !== "UPDATE") return "";
    var ignored = { id:true, created_at:true, updated_at:true };
    var before = log.before_data || {};
    var after = log.after_data || {};
    var fields = (log.changed_fields || []).filter(function (field) {
      return !ignored[field];
    });
    if (!fields.length) return "内部データを更新";
    return fields.slice(0, 6).map(function (field) {
      return auditFieldLabel(field) + "：" +
        auditValueLabel(field, before[field]) + " → " +
        auditValueLabel(field, after[field]);
    }).join(" / ") + (fields.length > 6 ? " ほか" : "");
  }

  function auditTimeLabel(value) {
    if (!value) return "";
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    return date.toLocaleString("ja-JP", {
      timeZone:"Asia/Tokyo",
      year:"numeric",
      month:"numeric",
      day:"numeric",
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit"
    });
  }

  function renderAuditHistory(logs) {
    var list = document.getElementById("auditHistoryList");
    if (!list) return;
    if (!logs || !logs.length) {
      list.innerHTML = '<p class="audit-empty">まだ変更履歴はありません。</p>';
      return;
    }

    list.innerHTML = logs.map(function (log) {
      var action = auditActionLabel(log.action);
      var actionClass = log.action === "INSERT" ? "add" : log.action === "DELETE" ? "delete" : "update";
      var details = auditChangedDetail(log);
      return '<article class="audit-history-row">' +
        '<div class="audit-history-head">' +
          '<div><span class="audit-action ' + actionClass + '">' + escapeHtml(action) + '</span>' +
          '<strong>' + escapeHtml(auditTableLabel(log.table_name)) + '</strong></div>' +
          '<time>' + escapeHtml(auditTimeLabel(log.changed_at)) + '</time>' +
        '</div>' +
        '<p class="audit-history-actor">' + escapeHtml(auditActorLabel(log)) + ' が操作</p>' +
        '<p class="audit-history-target">' + escapeHtml(auditRecordLabel(log)) + '</p>' +
        (details ? '<p class="audit-history-detail">' + escapeHtml(details) + '</p>' : '') +
      '</article>';
    }).join("");
  }

  async function openAuditHistory() {
    var dialog = document.getElementById("auditHistoryDialog");
    var list = document.getElementById("auditHistoryList");
    if (!dialog || !list) return;
    list.innerHTML = '<p class="audit-empty">履歴を読み込んでいます…</p>';
    dialog.showModal();
    try {
      renderAuditHistory(await window.kakeiboDb.getAuditLogs(300));
    } catch (error) {
      console.error(error);
      list.innerHTML = '<p class="audit-empty audit-error">変更履歴を読み込めませんでした。</p>';
    }
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

  function normalizeCsvHeader(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[\s　・･._\-—–ー\/\\（）()［\]\[\]]/g, "");
  }

  function parseCsvText(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var source = String(text || "").replace(/^\uFEFF/, "");

    function pushField() {
      row.push(field);
      field = "";
    }

    function pushRow() {
      pushField();
      if (row.some(function (value) { return String(value).trim() !== ""; })) {
        rows.push(row);
      }
      row = [];
    }

    for (var i = 0; i < source.length; i += 1) {
      var ch = source[i];
      if (inQuotes) {
        if (ch === '"') {
          if (source[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        pushField();
      } else if (ch === "\n") {
        pushRow();
      } else if (ch !== "\r") {
        field += ch;
      }
    }

    if (field !== "" || row.length) pushRow();
    return rows;
  }

  function decodeCsvBuffer(buffer) {
    try {
      return new TextDecoder("utf-8", { fatal:true }).decode(buffer).replace(/^\uFEFF/, "");
    } catch (utf8Error) {
      try {
        return new TextDecoder("shift_jis").decode(buffer).replace(/^\uFEFF/, "");
      } catch (sjisError) {
        return new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
      }
    }
  }

  function csvColumnIndex(headers, candidates, fallbackWords) {
    var normalized = headers.map(normalizeCsvHeader);
    var candidateMap = {};
    candidates.forEach(function (name) {
      candidateMap[normalizeCsvHeader(name)] = true;
    });

    for (var i = 0; i < normalized.length; i += 1) {
      if (candidateMap[normalized[i]]) return i;
    }

    for (var j = 0; j < normalized.length; j += 1) {
      if (fallbackWords.some(function (word) {
        return normalized[j].indexOf(normalizeCsvHeader(word)) !== -1;
      })) return j;
    }
    return -1;
  }

  function detectCsvHeader(rows) {
    var dateNames = ["利用日","ご利用日","利用年月日","ご利用年月日","売上日","取引日","年月日","利用日付"];
    var merchantNames = ["利用先","ご利用先","利用店名","ご利用店名","加盟店名","店名","摘要","内容","利用内容","ご利用内容"];
    var amountNames = ["利用金額","ご利用金額","利用額","ご利用額","金額","支払金額","支払総額","請求金額","ご請求金額"];

    for (var i = 0; i < Math.min(rows.length, 12); i += 1) {
      var headers = rows[i];
      var dateIndex = csvColumnIndex(headers, dateNames, ["利用日","利用年月日","取引日","売上日","年月日"]);
      var merchantIndex = csvColumnIndex(headers, merchantNames, ["利用先","利用店","加盟店","店名","摘要","内容"]);
      var amountIndex = csvColumnIndex(headers, amountNames, ["利用金額","利用額","請求金額","金額"]);

      if (dateIndex >= 0 && merchantIndex >= 0 && amountIndex >= 0) {
        return {
          rowIndex:i,
          dateIndex:dateIndex,
          merchantIndex:merchantIndex,
          amountIndex:amountIndex
        };
      }
    }
    return null;
  }

  function parseCsvDate(value) {
    var raw = normalizeText(value);
    if (!raw) return null;

    var year;
    var month;
    var day;
    var full = raw.match(/(\d{4})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
    var short = raw.match(/^(\d{1,2})\D{1,3}(\d{1,2})(?:\D|$)/);

    if (full) {
      year = Number(full[1]);
      month = Number(full[2]);
      day = Number(full[3]);
    } else if (short) {
      month = Number(short[1]);
      day = Number(short[2]);
      var ref = state.currentMonth || actualMonthKey();
      var refParts = ref.split("-");
      var refYear = Number(refParts[0]);
      var refMonth = Number(refParts[1]);
      var refTime = Date.UTC(refYear, refMonth - 1, 15);
      var candidates = [refYear - 1, refYear, refYear + 1].map(function (candidateYear) {
        return {
          year:candidateYear,
          distance:Math.abs(Date.UTC(candidateYear, month - 1, day) - refTime)
        };
      }).sort(function (a,b) {
        return a.distance - b.distance;
      });
      year = candidates[0].year;
    } else {
      var digits = raw.replace(/\D/g, "");
      if (digits.length >= 8) {
        year = Number(digits.slice(0,4));
        month = Number(digits.slice(4,6));
        day = Number(digits.slice(6,8));
      } else {
        return null;
      }
    }

    var date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) return null;

    return year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  function parseCsvAmount(value) {
    var raw = normalizeText(value);
    if (!raw) return null;
    var negative = /^-/.test(raw) || /-$/.test(raw) || /^[▲△]/.test(raw) || /^\(.*\)$/.test(raw);
    var digits = raw.replace(/[^0-9]/g, "");
    if (!digits) return null;
    var amount = Number(digits);
    if (!Number.isFinite(amount) || amount === 0) return null;
    return negative ? -amount : amount;
  }

  function dateDistanceInDays(a, b) {
    var aTime = Date.parse(a + "T00:00:00Z");
    var bTime = Date.parse(b + "T00:00:00Z");
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return 999;
    return Math.abs(aTime - bTime) / 86400000;
  }

  function findCsvExistingMatch(row) {
    var merchantKey = normalizeMerchant(row.merchant_name);
    var matchCandidates = state.data.transactions.filter(function (tx) {
      return normalizeText(tx.memo).indexOf("現金") === -1;
    });

    var sameDateAmount = matchCandidates.filter(function (tx) {
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

    var nearbyMerchant = matchCandidates.filter(function (tx) {
      return Number(tx.amount) === Number(row.amount) &&
        normalizeMerchant(tx.merchant_name) === merchantKey &&
        dateDistanceInDays(tx.date, row.date) <= 3;
    }).sort(function (a, b) {
      return dateDistanceInDays(a.date, row.date) - dateDistanceInDays(b.date, row.date);
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

  function csvMerchantRule(merchantName) {
    var key = normalizeMerchant(merchantName);
    return (state.data.merchant_rules || []).find(function (rule) {
      return normalizeMerchant(rule.merchant_name) === key;
    }) || null;
  }

  function pdfWorkerUrl() {
    return "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  function pdfDocumentOptions(buffer) {
    return {
      data:new Uint8Array(buffer.slice(0)),
      cMapUrl:"https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
      cMapPacked:true,
      standardFontDataUrl:"https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/",
      useSystemFonts:true
    };
  }

  async function extractPdfRows(buffer) {
    if (!window.pdfjsLib) {
      throw new Error("PDF読み込み機能を起動できませんでした。");
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl();

    var loadingTask = window.pdfjsLib.getDocument(pdfDocumentOptions(buffer));
    var pdf;

    try {
      pdf = await loadingTask.promise;
    } catch (error) {
      if (error && (error.name === "PasswordException" || /password/i.test(error.message || ""))) {
        throw new Error("パスワード付きPDFはそのまま読み込めません。パスワード保護を解除したPDFを使ってください。");
      }
      throw error;
    }

    var rows = [];
    var fullText = [];
    var pages = [];

    for (var pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      var page = await pdf.getPage(pageNumber);
      var content = await page.getTextContent();
      var items = (content.items || []).map(function (item) {
        return {
          text: normalizeText(item.str),
          x: item.transform ? Number(item.transform[4] || 0) : 0,
          y: item.transform ? Number(item.transform[5] || 0) : 0
        };
      }).filter(function (item) {
        return item.text;
      });

      items.forEach(function (item) {
        fullText.push(item.text);
      });

      pages.push({
        page:pageNumber,
        items:items.slice()
      });

      items.sort(function (a, b) {
        if (Math.abs(a.y - b.y) > 2.5) return b.y - a.y;
        return a.x - b.x;
      });

      var pageRows = [];
      items.forEach(function (item) {
        var target = null;
        for (var i = pageRows.length - 1; i >= 0; i -= 1) {
          if (Math.abs(pageRows[i].y - item.y) <= 2.5) {
            target = pageRows[i];
            break;
          }
          if (pageRows[i].y - item.y > 8) break;
        }

        if (!target) {
          target = { y:item.y, items:[] };
          pageRows.push(target);
        }
        target.items.push(item);
      });

      pageRows.forEach(function (row) {
        row.items.sort(function (a, b) { return a.x - b.x; });
        rows.push({
          page:pageNumber,
          items:row.items,
          text:row.items.map(function (item) { return item.text; }).join(" ")
        });
      });
    }

    return {
      rows:rows,
      text:fullText.join(" "),
      pages:pages
    };
  }

  async function loadPdfDocument(buffer) {
    if (!window.pdfjsLib) {
      throw new Error("PDF読み込み機能を起動できませんでした。");
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl();
    var loadingTask = window.pdfjsLib.getDocument(pdfDocumentOptions(buffer));

    try {
      return await loadingTask.promise;
    } catch (error) {
      if (error && (error.name === "PasswordException" || /password/i.test(error.message || ""))) {
        throw new Error("パスワード付きPDFはそのまま読み込めません。パスワード保護を解除したPDFを使ってください。");
      }
      throw error;
    }
  }

  function ocrCandidateRows(lines, pageNumber) {
    var normalizedLines = (lines || []).map(function (line) {
      return normalizeText(line && line.text != null ? line.text : line);
    }).filter(Boolean);

    var rows = [];
    normalizedLines.forEach(function (line, index) {
      if (!pdfDateMatch(line)) return;

      var variants = [line];
      if (index + 1 < normalizedLines.length) variants.push(line + " " + normalizedLines[index + 1]);
      if (index + 2 < normalizedLines.length) variants.push(line + " " + normalizedLines[index + 1] + " " + normalizedLines[index + 2]);

      variants.forEach(function (text) {
        rows.push({
          page:pageNumber,
          items:[{ text:text, x:0, y:0 }],
          text:text
        });
      });
    });

    if (!rows.length) {
      normalizedLines.forEach(function (line) {
        rows.push({
          page:pageNumber,
          items:[{ text:line, x:0, y:0 }],
          text:line
        });
      });
    }

    return rows;
  }

  async function extractPdfRowsWithOcr(buffer, onProgress) {
    if (!window.Tesseract) {
      throw new Error("画像PDFの文字読み取り機能を起動できませんでした。");
    }

    var pdf = await loadPdfDocument(buffer);
    var rows = [];
    var fullText = [];
    var worker = null;

    try {
      if (window.Tesseract.createWorker) {
        worker = await window.Tesseract.createWorker("jpn+eng", 1, {
          logger:function (status) {
            if (!onProgress || !status) return;
            if (status.status === "recognizing text" && typeof status.progress === "number") {
              onProgress("画像PDFを読み取り中… " + Math.round(status.progress * 100) + "%");
            }
          }
        });
      }

      for (var pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (onProgress) onProgress("画像PDFを読み取り中… " + pageNumber + "/" + pdf.numPages + "ページ");

        var page = await pdf.getPage(pageNumber);
        var viewport = page.getViewport({ scale:1.6 });
        var canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        var context = canvas.getContext("2d", { alpha:false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext:context,
          viewport:viewport
        }).promise;

        var recognition;
        if (worker) {
          recognition = await worker.recognize(canvas);
        } else {
          recognition = await window.Tesseract.recognize(canvas, "jpn+eng");
        }

        var text = recognition && recognition.data ? (recognition.data.text || "") : "";
        fullText.push(text);

        var lines = recognition && recognition.data && recognition.data.lines
          ? recognition.data.lines
          : text.split(/\r?\n/).map(function (line) { return { text:line }; });

        rows = rows.concat(ocrCandidateRows(lines, pageNumber));

        canvas.width = 1;
        canvas.height = 1;
      }
    } finally {
      if (worker && worker.terminate) {
        await worker.terminate();
      }
    }

    return {
      rows:rows,
      text:fullText.join("\n")
    };
  }

  function pdfDateMatch(text) {
    return normalizeText(text).match(/(?:20\d{2}[\/\.\-年]\s*\d{1,2}[\/\.\-月]\s*\d{1,2}日?|\d{1,2}[\/\.\-]\d{1,2})/);
  }

  function parsePdfAmountToken(value) {
    var raw = normalizeText(value);
    if (!raw) return null;
    if (/[年月日/:]/.test(raw)) return null;
    if (/[%回]/.test(raw)) return null;
    if (!/^(?:-|▲|△|\()?\s*[¥￥]?\s*[0-9][0-9,]*\s*円?\)?-?$/.test(raw)) return null;
    return parseCsvAmount(raw);
  }

  function cleanPdfMerchant(value) {
    return normalizeText(value)
      .replace(/^[・:\-–—\s]+|[・:\-–—\s]+$/g, "")
      .replace(/\s{2,}/g, " ");
  }

  function isEposPdf(text) {
    return /エポスカード|EPOS|MARUI GROUP/i.test(normalizeText(text));
  }

  function parseEposPdfText(text) {
    var source = normalizeText(text).replace(/\s+/g, " ");
    var rows = [];
    var pattern = /(?:^|\s)(\d{2})\s+(\d{2})\s+(\d{2})\s+(.{2,120}?)\s+([▲△-]?[0-9][0-9,]*)\s+(?:１|1)回\s+(\d+)\s+([▲△-]?[0-9][0-9,]*)(?=\s|$)/g;
    var match;

    while ((match = pattern.exec(source)) !== null) {
      var year = Number(match[1]);
      var month = Number(match[2]);
      var day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;

      var merchant = cleanPdfMerchant(match[4]).replace(/\s{2,}/g, " ").trim();
      var amount = parsePdfAmountToken(match[5]);
      if (!merchant || merchant.length < 2 || amount == null) continue;

      var date = parseCsvDate(
        (2000 + year) + "/" +
        String(month).padStart(2, "0") + "/" +
        String(day).padStart(2, "0")
      );
      if (!date) continue;

      rows.push({
        date:date,
        merchant_name:merchant,
        merchant_raw:match[0].trim(),
        amount:amount
      });
    }
    return rows;
  }

  function parseEposPdfPages(pages) {
    var parsedRows = [];
    var candidateLines = 0;

    (pages || []).forEach(function (page) {
      var items = (page.items || []).slice().sort(function (a, b) {
        var ay = Number(a.y || 0);
        var by = Number(b.y || 0);
        if (Math.abs(ay - by) > 3) return by - ay;
        return Number(a.x || 0) - Number(b.x || 0);
      });

      var lines = [];
      items.forEach(function (item) {
        var y = Number(item.y || 0);
        var target = null;

        for (var i = 0; i < lines.length; i += 1) {
          if (Math.abs(Number(lines[i].y || 0) - y) <= 3) {
            target = lines[i];
            break;
          }
        }

        if (!target) {
          target = { y:y, items:[] };
          lines.push(target);
        }
        target.items.push(item);
      });

      lines.forEach(function (line) {
        line.items.sort(function (a, b) {
          return Number(a.x || 0) - Number(b.x || 0);
        });

        var dateTokens = line.items.filter(function (item) {
          var x = Number(item.x || 0);
          return x >= 45 && x < 90 && /^\d{2}$/.test(normalizeText(item.text));
        });

        if (dateTokens.length < 3) return;

        var year = Number(normalizeText(dateTokens[0].text));
        var month = Number(normalizeText(dateTokens[1].text));
        var day = Number(normalizeText(dateTokens[2].text));

        if (year < 0 || month < 1 || month > 12 || day < 1 || day > 31) return;
        candidateLines += 1;

        var amountItems = line.items.filter(function (item) {
          var x = Number(item.x || 0);
          return x >= 300 && x < 360;
        });

        var amount = null;
        for (var i = 0; i < amountItems.length; i += 1) {
          amount = parsePdfAmountToken(amountItems[i].text);
          if (amount) break;
        }
        if (!amount) return;

        var merchant = cleanPdfMerchant(line.items.filter(function (item) {
          var x = Number(item.x || 0);
          return x >= 80 && x < 300;
        }).map(function (item) {
          return normalizeText(item.text);
        }).join(" "))
          .replace(/\s{2,}/g, " ")
          .trim();

        if (!merchant || merchant.length < 2) return;

        var fullYear = 2000 + year;
        var date = parseCsvDate(
          fullYear + "/" +
          String(month).padStart(2, "0") + "/" +
          String(day).padStart(2, "0")
        );
        if (!date) return;

        parsedRows.push({
          date:date,
          merchant_name:merchant,
          merchant_raw:line.items.map(function (item) {
            return normalizeText(item.text);
          }).join(" "),
          amount:amount
        });
      });
    });

    return {
      rows:parsedRows,
      candidateLines:candidateLines
    };
  }

  function parseRakutenPdfPages(pages) {
    var parsedRows = [];
    var dateLines = 0;
    var amountLines = 0;
    var itemCount = 0;

    function parseDateFromLine(lineText) {
      var compact = normalizeText(lineText)
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\s+/g, "");

      var separated = compact.match(/(20\d{2})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})/);
      if (separated) {
        return parseCsvDate(separated[1] + "/" + separated[2] + "/" + separated[3]);
      }

      var digits = compact.replace(/[^0-9]/g, "");
      var eight = digits.match(/(20\d{2})(\d{2})(\d{2})/);
      if (eight) {
        return parseCsvDate(eight[1] + "/" + eight[2] + "/" + eight[3]);
      }

      return null;
    }

    (pages || []).forEach(function (page) {
      var items = (page.items || []).slice();
      itemCount += items.length;

      items.sort(function (a, b) {
        var ay = Number(a.y || 0);
        var by = Number(b.y || 0);
        if (Math.abs(ay - by) > 10) return by - ay;
        return Number(a.x || 0) - Number(b.x || 0);
      });

      var lines = [];
      items.forEach(function (item) {
        var target = null;
        var y = Number(item.y || 0);

        for (var i = 0; i < lines.length; i += 1) {
          if (Math.abs(Number(lines[i].y || 0) - y) <= 10) {
            target = lines[i];
            break;
          }
        }

        if (!target) {
          target = { y:y, items:[] };
          lines.push(target);
        }
        target.items.push(item);
      });

      lines.forEach(function (line) {
        line.items.sort(function (a, b) {
          return Number(a.x || 0) - Number(b.x || 0);
        });

        var lineText = line.items.map(function (item) {
          return normalizeText(item.text);
        }).join(" ");

        var date = parseDateFromLine(lineText);
        if (!date) return;
        dateLines += 1;

        var amountColumnItems = line.items.filter(function (item) {
          var x = Number(item.x || 0);
          return x >= 265 && x <= 355;
        });

        var amount = null;
        for (var i = 0; i < amountColumnItems.length; i += 1) {
          amount = parsePdfAmountToken(amountColumnItems[i].text);
          if (amount) break;
        }

        if (!amount && amountColumnItems.length) {
          var combinedAmount = normalizeText(amountColumnItems.map(function (item) {
            return item.text;
          }).join(""))
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\s+/g, "");

          amount = parsePdfAmountToken(combinedAmount);
        }

        if (!amount) return;
        amountLines += 1;

        var merchantParts = line.items.filter(function (item) {
          var x = Number(item.x || 0);
          return x >= 58 && x < 265;
        }).map(function (item) {
          return normalizeText(item.text);
        }).filter(function (text) {
          if (!text) return false;
          if (/^(?:本人|家族)\*?$/.test(text)) return false;
          if (text === "*") return false;
          if (/^(?:1回払い|一括払い|分割払い|リボ払い|ボーナス払い|回払い)$/.test(text)) return false;
          if (text === "1") return false;
          return true;
        });

        var merchant = cleanPdfMerchant(merchantParts.join(" "))
          .replace(/利用国\s*[A-Z]{3}/g, "")
          .replace(/本人\s*\*?/g, "")
          .replace(/家族\s*\*?/g, "")
          .replace(/(?:1\s*)?回払い|一括払い|分割払い|リボ払い|ボーナス払い/g, "")
          .replace(/\s{2,}/g, " ")
          .trim();

        if (!merchant || merchant.length < 2) return;

        parsedRows.push({
          date:date,
          merchant_name:merchant,
          merchant_raw:lineText,
          amount:amount
        });
      });
    });

    return {
      rows:parsedRows,
      dateLines:dateLines,
      amountLines:amountLines,
      itemCount:itemCount
    };
  }

  function parseRakutenPdfText(text) {
    var source = normalizeText(text).replace(/\s+/g, " ");
    var rows = [];
    var pattern = /(20\d{2}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})\s+((?:(?!20\d{2}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2}).){2,100}?)\s+(?:本人\*?|家族\*?)\s+(?:1回払い|一括払い|分割払い|リボ払い|ボーナス払い)\s+([▲△-]?[0-9][0-9,]*)/g;
    var match;

    while ((match = pattern.exec(source)) !== null) {
      var date = parseCsvDate(match[1]);
      var merchant = cleanPdfMerchant(match[2])
        .replace(/利用国[A-Z]{3}/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      var amount = parseCsvAmount(match[3]);

      if (!date || !merchant || amount == null) continue;
      rows.push({
        date:date,
        merchant_name:merchant,
        merchant_raw:match[0],
        amount:amount
      });
    }
    return rows;
  }

  function parseRakutenPdfStatementRow(row) {
    if (!row || !row.items || !row.items.length) return null;

    var dateItem = row.items.find(function (item) {
      return item.x < 75 && /^20\d{2}[\/.\-]\d{1,2}[\/.\-]\d{1,2}$/.test(normalizeText(item.text));
    });
    if (!dateItem) return null;

    var date = parseCsvDate(dateItem.text);
    if (!date) return null;

    var merchantItems = row.items.filter(function (item) {
      return item.x >= 58 && item.x < 220;
    }).filter(function (item) {
      var text = normalizeText(item.text);
      if (!text) return false;
      if (/^(本人\*?|家族\*?)$/.test(text)) return false;
      if (/^(?:1回払い|一括払い|分割払い|リボ払い|ボーナス払い)$/.test(text)) return false;
      return true;
    });

    var merchant = cleanPdfMerchant(merchantItems.map(function (item) {
      return item.text;
    }).join(" "));

    merchant = merchant
      .replace(/利用国[A-Z]{3}/g, "")
      .replace(/本人\*?/g, "")
      .replace(/家族\*?/g, "")
      .replace(/1回払い|一括払い|分割払い|リボ払い|ボーナス払い/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    var amountCandidates = row.items.filter(function (item) {
      return item.x >= 270 && item.x < 345;
    }).map(function (item) {
      return parsePdfAmountToken(item.text);
    }).filter(function (value) {
      return value != null;
    });

    var amount = amountCandidates.length ? amountCandidates[0] : null;
    if (!amount || !merchant) return null;

    return {
      date:date,
      merchant_name:merchant,
      merchant_raw:normalizeText(row.text),
      amount:amount
    };
  }

  function parsePdfStatementRow(row, defaultYear) {
    var text = normalizeText(row.text);
    if (!text) return null;

    if (/(ご請求額|請求金額|お支払金額|今回のお支払い|合計|小計|ポイント|キャッシング|ご利用可能額)/.test(text)) {
      return null;
    }

    var dateMatch = pdfDateMatch(text);
    if (!dateMatch) return null;

    var dateText = dateMatch[0];
    var date = parseCsvDate(dateText);
    if (!date) return null;

    if (/^\d{1,2}[\/\.\-]\d{1,2}$/.test(dateText) && defaultYear) {
      var parts = dateText.split(/[\/\.\-]/);
      var month = Number(parts[0]);
      var day = Number(parts[1]);
      date = defaultYear + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    }

    var amount = null;
    var amountText = "";
    var amountItemIndex = -1;

    for (var i = row.items.length - 1; i >= 0; i -= 1) {
      var candidate = parsePdfAmountToken(row.items[i].text);
      if (candidate) {
        amount = candidate;
        amountText = row.items[i].text;
        amountItemIndex = i;
        break;
      }
    }

    if (!amount) {
      var numericMatches = [];
      var numberRegex = /[¥￥]?\s*(?:\d{1,3}(?:,\d{3})+|\d{2,})\s*円?/g;
      var match;
      while ((match = numberRegex.exec(text)) !== null) {
        if (match.index > dateMatch.index + dateMatch[0].length) {
          var parsedAmount = parsePdfAmountToken(match[0]);
          if (parsedAmount) numericMatches.push({ value:parsedAmount, text:match[0], index:match.index });
        }
      }
      if (numericMatches.length) {
        var picked = numericMatches[numericMatches.length - 1];
        amount = picked.value;
        amountText = picked.text;
      }
    }

    if (!amount) return null;

    var merchant = "";

    if (amountItemIndex >= 0) {
      var merchantParts = row.items.filter(function (item, index) {
        if (index === amountItemIndex) return false;
        if (pdfDateMatch(item.text)) return false;
        if (parsePdfAmountToken(item.text)) return false;
        return true;
      }).map(function (item) {
        return item.text;
      });
      merchant = cleanPdfMerchant(merchantParts.join(" "));
    }

    if (!merchant) {
      var start = dateMatch.index + dateMatch[0].length;
      var end = text.lastIndexOf(amountText);
      if (end <= start) end = text.length;
      merchant = cleanPdfMerchant(text.slice(start, end));
    }

    merchant = merchant
      .replace(/\b(?:1回払い|一括払い|分割払い|リボ払い|ボーナス払い)\b/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!merchant || merchant.length < 2) return null;

    return {
      date:date,
      merchant_name:merchant,
      merchant_raw:text,
      amount:amount
    };
  }

  async function buildPdfRows(buffer, onProgress, cardCompany) {
    if (cardCompany !== "rakuten" && cardCompany !== "epos") {
      throw new Error("カード会社を選んでください。");
    }

    var extracted = await extractPdfRows(buffer);
    var yearMatch = extracted.text.match(/(20\d{2})\s*年/);
    var defaultYear = yearMatch ? Number(yearMatch[1]) : Number(state.currentMonth.split("-")[0]);

    var result = [];
    var ignored = 0;
    var seen = {};

    function appendParsedPdfRow(parsed) {
      if (!parsed) return;

      var rule = csvMerchantRule(parsed.merchant_name);
      var autoRule = rule && rule.mode === "auto";
      var confirmRule = rule && rule.mode === "confirm";
      var row = {
        date:parsed.date,
        merchant_name:parsed.merchant_name,
        merchant_raw:parsed.merchant_raw,
        amount:parsed.amount,
        category_name:autoRule ? rule.category_name : null,
        scope:autoRule ? rule.scope : null,
        selected:true,
        duplicate:false,
        disabled:false,
        matchReason:confirmRule
          ? "店舗ルールが「毎回確認」です。反映後に分類してください。"
          : ""
      };

      var rowMonth = monthKeyFromDate(row.date);
      if (rowMonth < OPERATION_START_MONTH) {
        row.selected = false;
        row.disabled = true;
        row.matchReason = monthLabel(OPERATION_START_MONTH) + "運用開始前の明細なので反映対象外です。";
      } else if (paidSettlementRecord(rowMonth)) {
        row.selected = false;
        row.disabled = true;
        row.matchReason = "この月は精算済みです。追加する場合は先に支払済み記録を取り消してください。";
      }

      var key = row.date + "|" + row.amount + "|" + normalizeMerchant(row.merchant_name);
      var existing = findCsvExistingMatch(row);

      if (seen[key]) {
        row.duplicate = true;
        row.selected = false;
        row.matchReason = "このPDF内に同じ日・金額・利用先の明細があります";
      } else if (existing) {
        row.duplicate = true;
        row.selected = false;
        row.matchReason = existing.reason;
        row.matchedTxs = existing.txs || [existing.tx];
      }

      seen[key] = true;
      result.push(row);
    }

    if (cardCompany === "epos") {
      if (/楽天カード株式会社|楽天カード/.test(extracted.text)) {
        throw new Error("このPDFは楽天カードの明細です。カード会社を「楽天カード」に変更してください。");
      }

      var eposTextRows = parseEposPdfText(extracted.text);
      var eposResult = parseEposPdfPages(extracted.pages);
      var eposRows = eposTextRows.length ? eposTextRows : eposResult.rows;

      if (!eposRows.length) {
        throw new Error(
          "エポスカードの明細として読み取れませんでした。" +
          "（テキスト候補 " + eposTextRows.length +
          "件 / 座標候補 " + eposResult.candidateLines + "件）"
        );
      }
      eposRows.forEach(appendParsedPdfRow);
    } else {
      if (isEposPdf(extracted.text)) {
        throw new Error("このPDFはエポスカードの明細です。カード会社を「エポスカード」に変更してください。");
      }

      var rakutenPageResult = parseRakutenPdfPages(extracted.pages);
      var rakutenRows = rakutenPageResult.rows.length
        ? rakutenPageResult.rows
        : parseRakutenPdfText(extracted.text);

      if (rakutenRows.length) {
        rakutenRows.forEach(appendParsedPdfRow);
      } else {
        extracted.rows.forEach(function (pdfRow) {
          var parsed = parseRakutenPdfStatementRow(pdfRow) ||
            parsePdfStatementRow(pdfRow, defaultYear);
          if (!parsed) {
            if (pdfDateMatch(pdfRow.text)) ignored += 1;
            return;
          }
          appendParsedPdfRow(parsed);
        });
      }

      if (!result.length) {
        if (onProgress) onProgress("画像PDFとして読み取りを試しています…");

        var ocrExtracted = await extractPdfRowsWithOcr(buffer, onProgress);
        var ocrYearMatch = ocrExtracted.text.match(/(20\d{2})\s*年/);
        var ocrDefaultYear = ocrYearMatch ? Number(ocrYearMatch[1]) : defaultYear;
        ignored = 0;
        seen = {};

        var ocrTextRows = parseRakutenPdfText(ocrExtracted.text);
        if (ocrTextRows.length) {
          ocrTextRows.forEach(appendParsedPdfRow);
        } else {
          ocrExtracted.rows.forEach(function (pdfRow) {
            var parsed = parseRakutenPdfStatementRow(pdfRow) ||
              parsePdfStatementRow(pdfRow, ocrDefaultYear);
            if (!parsed) {
              if (pdfDateMatch(pdfRow.text)) ignored += 1;
              return;
            }
            appendParsedPdfRow(parsed);
          });
        }

        if (!result.length) {
          throw new Error(
            "PDFの文字読み取りはできましたが、明細を判定できませんでした。" +
            "（文字 " + rakutenPageResult.itemCount +
            "個 / 日付候補 " + rakutenPageResult.dateLines +
            "件 / 金額行 " + rakutenPageResult.amountLines + "件）"
          );
        }
      }
    }

    return { rows:result, ignored:ignored };
  }

  function buildCsvRows(text) {
    var parsed = parseCsvText(text);
    var header = detectCsvHeader(parsed);
    if (!header) {
      throw new Error("CSVの「利用日・利用先・金額」の列を見つけられませんでした。");
    }

    var result = [];
    var ignored = 0;
    var csvSeen = {};

    parsed.slice(header.rowIndex + 1).forEach(function (values) {
      var date = parseCsvDate(values[header.dateIndex]);
      var merchant = normalizeText(values[header.merchantIndex]);
      var amount = parseCsvAmount(values[header.amountIndex]);

      if (!date || !merchant || amount == null) {
        ignored += 1;
        return;
      }

      var rule = csvMerchantRule(merchant);
      var autoRule = rule && rule.mode === "auto";
      var confirmRule = rule && rule.mode === "confirm";
      var row = {
        date:date,
        merchant_name:merchant,
        merchant_raw:merchant,
        amount:amount,
        category_name:autoRule ? rule.category_name : null,
        scope:autoRule ? rule.scope : null,
        selected:true,
        duplicate:false,
        disabled:false,
        matchReason:confirmRule
          ? "店舗ルールが「毎回確認」です。反映後に分類してください。"
          : ""
      };

      var rowMonth = monthKeyFromDate(row.date);
      if (rowMonth < OPERATION_START_MONTH) {
        row.selected = false;
        row.disabled = true;
        row.matchReason = monthLabel(OPERATION_START_MONTH) + "運用開始前の明細なので反映対象外です。";
      } else if (paidSettlementRecord(rowMonth)) {
        row.selected = false;
        row.disabled = true;
        row.matchReason = "この月は精算済みです。追加する場合は先に支払済み記録を取り消してください。";
      }

      var csvKey = date + "|" + amount + "|" + normalizeMerchant(merchant);
      var existing = findCsvExistingMatch(row);
      if (csvSeen[csvKey]) {
        row.duplicate = true;
        row.selected = false;
        row.matchReason = "このCSV内に同じ日・金額・利用先の明細があります";
      } else if (existing) {
        row.duplicate = true;
        row.selected = false;
        row.matchReason = existing.reason;
        row.matchedTxs = existing.txs || [existing.tx];
      }
      csvSeen[csvKey] = true;
      result.push(row);
    });

    return { rows:result, ignored:ignored };
  }

  function csvMatchedTxDetails(row) {
    var matches = row.matchedTxs || (row.matchedTx ? [row.matchedTx] : []);
    if (!matches.length) return "";

    var cards = matches.map(function (tx, matchIndex) {
      var txMeta = shortDate(tx.date) + " ・ " +
        (tx.category_name || "その他") + " ・ " + scopeLabel(tx.scope);
      var memo = normalizeText(tx.memo);

      return '<div class="csv-match-detail">' +
        '<div class="csv-match-detail-kicker">家計簿にある候補 ' + (matchIndex + 1) + '</div>' +
        '<div class="csv-match-detail-head"><strong>' +
        escapeHtml(tx.merchant_name || "利用先未設定") + '</strong><b>' + yen(tx.amount) + '</b></div>' +
        '<div class="csv-match-detail-meta">' + escapeHtml(txMeta) + '</div>' +
        (memo ? '<div class="csv-match-detail-memo">メモ：' + escapeHtml(memo) + '</div>' : '') +
        '</div>';
    }).join("");

    return '<details class="csv-match-compare">' +
      '<summary>似ている明細を見る（' + matches.length + '件）</summary>' +
      '<div class="csv-match-detail-list">' + cards + '</div></details>';
  }

  function csvReviewRow(row, index) {
    var meta = shortDate(row.date) + " ・ " +
      (row.category_name || "未分類") + " ・ " +
      (row.scope ? scopeLabel(row.scope) : "要確認");

    return '<div class="csv-review-row' +
      (row.duplicate ? " duplicate" : "") +
      (row.disabled ? " disabled" : "") + '">' +
      '<input type="checkbox" data-csv-row="' + index + '" aria-label="この明細を反映する"' +
      (row.selected ? " checked" : "") +
      (row.disabled ? " disabled" : "") + '>' +
      '<div class="csv-review-main"><strong>' + escapeHtml(row.merchant_name) + '</strong>' +
      '<div class="csv-review-meta"><span>' + escapeHtml(meta) + '</span><b>' + yen(row.amount) + '</b></div>' +
      (row.matchReason ? '<div class="csv-match-reason">' + escapeHtml(row.matchReason) + '</div>' : '') +
      csvMatchedTxDetails(row) +
      '</div></div>';
  }

  function updateCsvImportButton() {
    var selected = state.csvRows.filter(function (row) { return row.selected; }).length;
    var button = document.getElementById("csvImportButton");
    button.disabled = selected === 0;
    button.textContent = selected ? selected + "件を家計簿に反映する" : "反映する明細を選んでください";
  }

  function renderCsvReview() {
    var newRows = [];
    var duplicateRows = [];
    state.csvRows.forEach(function (row, index) {
      var item = { row:row, index:index };
      (row.duplicate ? duplicateRows : newRows).push(item);
    });

    document.getElementById("csvNewCount").textContent = newRows.length;
    document.getElementById("csvDuplicateCount").textContent = duplicateRows.length;
    document.getElementById("csvNewList").innerHTML = newRows.length
      ? newRows.map(function (x) { return csvReviewRow(x.row, x.index); }).join("")
      : '<p class="csv-empty">未記入と思われる明細はありません。</p>';
    document.getElementById("csvDuplicateList").innerHTML = duplicateRows.length
      ? duplicateRows.map(function (x) { return csvReviewRow(x.row, x.index); }).join("")
      : '<p class="csv-empty">記入済み候補はありません。</p>';

    document.querySelectorAll("[data-csv-row]").forEach(function (checkbox) {
      checkbox.onchange = function () {
        var index = Number(checkbox.getAttribute("data-csv-row"));
        if (state.csvRows[index]) state.csvRows[index].selected = checkbox.checked;
        updateCsvSelectionButtons();
        updateCsvImportButton();
      };
    });

    updateCsvSelectionButtons();
    updateCsvImportButton();
  }

  function updateCsvSelectionButtons() {
    [
      { id:"csvSelectNewButton", duplicate:false },
      { id:"csvSelectDuplicateButton", duplicate:true }
    ].forEach(function (config) {
      var rows = state.csvRows.filter(function (row) {
        return row.duplicate === config.duplicate && !row.disabled;
      });
      var button = document.getElementById(config.id);

      if (!rows.length) {
        button.disabled = true;
        button.textContent = "すべて選択";
        return;
      }

      button.disabled = false;
      var allSelected = rows.every(function (row) { return row.selected; });
      button.textContent = allSelected ? "すべて外す" : "すべて選択";
    });
  }

  function setCsvGroupSelection(duplicate, selected) {
    state.csvRows.forEach(function (row) {
      if (row.duplicate === duplicate && !row.disabled) row.selected = selected;
    });
    renderCsvReview();
  }

  function resetCsvImport() {
    state.csvRows = [];
    var company = document.getElementById("csvCardCompany");
    if (company) company.value = "";
    var input = document.getElementById("csvFileInput");
    if (input) input.value = "";
    var review = document.getElementById("csvReviewArea");
    if (review) review.classList.add("hidden");
    var message = document.getElementById("csvFileMessage");
    if (message) {
      message.classList.remove("error");
      message.textContent = "まだファイルは選ばれていません。";
    }
  }

  function txRow(tx) {
    var sub = shortDate(tx.date) + " ・ " + (tx.category_name || "その他") + " ・ " +
      scopeLabel(tx.scope) + " ・ 支払：" + payerLabel(tx.payer);
    return '<button type="button" class="transaction-row transaction-edit-row" data-edit-tx="' + tx.id + '">' +
      '<div class="tx-icon">' + iconFor(tx) + '</div>' +
      '<div class="tx-main"><strong>' + escapeHtml(tx.merchant_name) + '</strong><small>' + sub + '</small></div>' +
      '<div class="tx-side"><div class="tx-amount">' + yen(tx.amount) + '</div>' +
      '<span class="tx-edit-label">編集 ›</span></div></button>';
  }

  var CATEGORY_COLORS = [
    "#1f7a5a",
    "#4f8fa8",
    "#d09a45",
    "#9b78b4",
    "#d27575",
    "#6f9b70",
    "#7b838d"
  ];

  function normalizedCategory(tx) {
    return tx.category_name || "その他";
  }

  function confirmedSpending(transactions) {
    return transactions.filter(function (t) {
      return t.status === "confirmed" || t.status === "refunded";
    });
  }

  function categoryTotals(transactions) {
    var totals = {};
    confirmedSpending(transactions).forEach(function (tx) {
      var category = normalizedCategory(tx);
      totals[category] = (totals[category] || 0) + Number(tx.amount || 0);
    });
    return totals;
  }

  function sortedCategoryEntries(totals) {
    return Object.keys(totals).map(function (name) {
      return { name:name, amount:totals[name] };
    }).sort(function (a,b) {
      return Math.abs(b.amount) - Math.abs(a.amount);
    });
  }

  function categoryColorMap(categories) {
    var map = {};
    categories.forEach(function (name, index) {
      map[name] = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    });
    return map;
  }

  function analysisMonths() {
    var months = [];
    var cursor = state.currentMonth;
    for (var i = 0; i < 6; i += 1) {
      if (cursor < earliestAvailableMonth()) break;
      months.unshift(cursor);
      cursor = addMonths(cursor, -1);
    }
    return months;
  }

  function renderHomeCategoryChart(summary) {
    var entries = sortedCategoryEntries(categoryTotals(summary.monthTransactions));
    var container = document.getElementById("homeCategoryBars");
    var empty = document.getElementById("homeCategoryEmpty");
    var title = document.getElementById("usageTitle");

    title.textContent = monthLabel(state.currentMonth) + "分の使い道";

    if (!entries.length) {
      container.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }

    empty.classList.add("hidden");
    var maxAmount = Math.max.apply(null, entries.map(function (x) { return Math.abs(x.amount); }).concat([1]));
    var colors = categoryColorMap(entries.map(function (x) { return x.name; }));
    container.innerHTML = entries.slice(0, 6).map(function (entry) {
      var width = Math.max(4, Math.round(Math.abs(entry.amount) / maxAmount * 100));
      return '<div class="category-bar-row">' +
        '<div class="category-bar-head"><span>' + escapeHtml(entry.name) + '</span><strong>' +
        yen(entry.amount) + '</strong></div>' +
        '<div class="category-bar-track"><span style="width:' + width + '%;background:' +
        colors[entry.name] + '"></span></div></div>';
    }).join("");
  }

  function renderAnalysisChart() {
    var months = analysisMonths();
    var rows = months.map(function (month) {
      var txs = state.data.transactions.filter(function (t) {
        return monthKeyFromDate(t.date) === month;
      });
      return { month:month, totals:categoryTotals(txs) };
    });

    var categorySet = {};
    rows.forEach(function (row) {
      Object.keys(row.totals).forEach(function (name) {
        categorySet[name] = true;
      });
    });

    var categories = Object.keys(categorySet).sort(function (a,b) {
      var totalA = rows.reduce(function (sum,row) { return sum + Number(row.totals[a] || 0); }, 0);
      var totalB = rows.reduce(function (sum,row) { return sum + Number(row.totals[b] || 0); }, 0);
      return Math.abs(totalB) - Math.abs(totalA);
    });

    var colorMap = categoryColorMap(categories);
    var totalsByMonth = rows.map(function (row) {
      return Object.keys(row.totals).reduce(function (sum,key) {
        return sum + Number(row.totals[key] || 0);
      }, 0);
    });
    var maxTotal = Math.max.apply(null, totalsByMonth.map(function (x) { return Math.abs(x); }).concat([1]));
    var rangeTotal = totalsByMonth.reduce(function (sum,x) { return sum + x; }, 0);

    document.getElementById("analysisRangeLabel").textContent =
      months.length > 1
        ? months[0].replace("-", "年") + "月〜" + monthLabel(months[months.length - 1])
        : (months[0] ? months[0].replace("-", "年") + "月" : "");
    document.getElementById("analysisRangeTotal").textContent = yen(rangeTotal);

    var chart = document.getElementById("monthlyStackedChart");
    var empty = document.getElementById("monthlyStackedEmpty");
    var legend = document.getElementById("analysisLegend");

    if (!categories.length) {
      chart.innerHTML = "";
      legend.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }

    empty.classList.add("hidden");

    chart.innerHTML = rows.map(function (row, index) {
      var monthTotal = totalsByMonth[index];
      var height = monthTotal ? Math.max(8, Math.round(Math.abs(monthTotal) / maxTotal * 100)) : 0;
      var positiveTotal = categories.reduce(function (sum, category) {
        return sum + Math.max(0, Number(row.totals[category] || 0));
      }, 0);
      var segments = categories.map(function (category) {
        var amount = Number(row.totals[category] || 0);
        if (amount <= 0 || positiveTotal <= 0) return "";
        var segmentHeight = amount / positiveTotal * 100;
        return '<span class="stack-segment" title="' + escapeHtml(category) + ' ' + yen(amount) +
          '" style="height:' + segmentHeight + '%;background:' + colorMap[category] + '">' +
          '<b class="stack-segment-value">' + yen(amount) + '</b></span>';
      }).join("");

      return '<div class="stack-month">' +
        '<div class="stack-total">' + (monthTotal ? yen(monthTotal) : "¥0") + '</div>' +
        '<div class="stack-column-wrap"><div class="stack-column" style="height:' + height + '%">' +
        segments + '</div></div>' +
        '<div class="stack-month-label">' + monthLabel(row.month) + '</div></div>';
    }).join("");

    legend.innerHTML = categories.map(function (category) {
      return '<span><i style="background:' + colorMap[category] + '"></i>' +
        escapeHtml(category) + '</span>';
    }).join("");
  }

  function carryOutRecord(category, monthKey) {
    var targetMonth = monthKey || state.currentMonth;
    return (state.data.carryovers || []).find(function (x) {
      return x.category === category && monthKeyFromDate(x.from_month) === targetMonth;
    }) || null;
  }

  function baseLivingCurrent(monthKey) {
    var monthTransactions = (state.data.transactions || []).filter(function (t) {
      return monthKeyFromDate(t.date) === monthKey &&
        t.scope === "shared" &&
        (t.status === "confirmed" || t.status === "refunded");
    });
    var total = monthTransactions.reduce(function (sum, t) {
      return sum + Number(t.amount || 0);
    }, 0);
    var myShare = Math.round(total * currentMeSharePercent() / 100);
    var paidByMe = monthTransactions.filter(function (t) {
      return t.payer === "me";
    }).reduce(function (sum, t) {
      return sum + Number(t.amount || 0);
    }, 0);
    return paidByMe - myShare;
  }

  function effectiveCarryOutAmount(monthKey, depth) {
    if (!monthKey || monthKey < OPERATION_START_MONTH) return 0;
    if ((depth || 0) > 120) return 0;

    var carryIn = monthKey === OPERATION_START_MONTH
      ? 0
      : effectiveCarryOutAmount(addMonths(monthKey, -1), (depth || 0) + 1);
    var settlement = baseLivingCurrent(monthKey) + carryIn;
    var record = carryOutRecord("living", monthKey);
    if (!record || settlement === 0) return 0;

    var raw = Number(record.amount || 0);
    if (!raw || Math.sign(raw) !== Math.sign(settlement)) return 0;
    return Math.sign(settlement) * Math.min(Math.abs(raw), Math.abs(settlement));
  }

  function carryInAmount(category, monthKey) {
    var targetMonth = monthKey || state.currentMonth;
    if (category !== "living" || targetMonth <= OPERATION_START_MONTH) return 0;
    return effectiveCarryOutAmount(addMonths(targetMonth, -1), 0);
  }

  function repaymentRecord(monthKey, plan) {
    return (state.data.repayments || []).find(function (x) {
      return Number(x.repayment_plan_id) === Number(plan && plan.id) &&
        monthKeyFromDate(x.repayment_month) === monthKey;
    }) || null;
  }

  function repaymentSetting(monthKey, plan) {
    return (state.data.repayment_amounts || []).find(function (x) {
      return Number(x.repayment_plan_id) === Number(plan && plan.id) &&
        monthKeyFromDate(x.repayment_month) === monthKey;
    }) || null;
  }

  function repaymentAmountForMonth(monthKey, plan) {
    if (!plan || !plan.id || monthKey < REPAYMENT_START_MONTH) return 0;

    var recorded = repaymentRecord(monthKey, plan);
    if (recorded) return Number(recorded.amount || 0);

    var setting = repaymentSetting(monthKey, plan);
    var monthlyAmount = setting
      ? Math.max(0, Number(setting.amount || 0))
      : Math.max(0, Number(plan.monthly_amount || 0));
    var originalAmount = Math.max(0, Number(plan.original_amount || 0));
    if (!monthlyAmount || !originalAmount) return 0;

    var repaidBefore = (state.data.repayments || []).filter(function (x) {
      return Number(x.repayment_plan_id) === Number(plan.id) &&
        monthKeyFromDate(x.repayment_month) < monthKey;
    }).reduce(function (sum, x) {
      return sum + Number(x.amount || 0);
    }, 0);

    var outstandingBeforeMonth = Math.max(0, originalAmount - repaidBefore);
    return Math.min(monthlyAmount, outstandingBeforeMonth);
  }

  function calculateSummary(monthKey) {
    var targetMonth = monthKey || state.currentMonth;
    var monthTransactions = state.data.transactions.filter(function (t) {
      return monthKeyFromDate(t.date) === targetMonth;
    });
    var shared = monthTransactions.filter(function (t) {
      return t.scope === "shared" && (t.status === "confirmed" || t.status === "refunded");
    });
    var total = shared.reduce(function (s,t) { return s + Number(t.amount); }, 0);
    var meSharePercent = currentMeSharePercent();
    var myShare = Math.round(total * meSharePercent / 100);
    var partnerShare = total - myShare;

    var paidByMe = shared.filter(function (t) { return t.payer === "me"; })
      .reduce(function (s,t) { return s + Number(t.amount); }, 0);
    var paidByPartner = shared.filter(function (t) { return t.payer === "partner"; })
      .reduce(function (s,t) { return s + Number(t.amount); }, 0);

    // Positive = うー owes にゃち. Negative = にゃち owes うー.
    var livingCurrent = paidByMe - myShare;
    var carryInLiving = carryInAmount("living", targetMonth);
    var livingSettlement = livingCurrent + carryInLiving;
    var livingCarryOutRecord = carryOutRecord("living", targetMonth);
    var livingCarryOut = effectiveCarryOutAmount(targetMonth, 0);
    var livingPayNow = livingSettlement - livingCarryOut;

    var plan = state.data.repayment_plan || {
      id:null, original_amount:0, remaining_amount:0, monthly_amount:0, lender:"me", borrower:"partner"
    };
    var monthlyRepayment = repaymentAmountForMonth(targetMonth, plan);
    var repaymentNet = plan.lender === "me" ? monthlyRepayment : -monthlyRepayment;
    var finalSettlement = livingPayNow + repaymentNet;

    return {
      month:targetMonth,
      total:total,
      myShare:myShare,
      partnerShare:partnerShare,
      paidByMe:paidByMe,
      paidByPartner:paidByPartner,
      livingCurrent:livingCurrent,
      carryInLiving:carryInLiving,
      livingSettlement:livingSettlement,
      livingCarryOut:livingCarryOut,
      livingPayNow:livingPayNow,
      monthlyRepayment:monthlyRepayment,
      repaymentNet:repaymentNet,
      finalSettlement:finalSettlement,
      plan:plan,
      monthTransactions:monthTransactions
    };
  }

  function directionText(amount) {
    return amount >= 0 ? "うー → にゃちへ支払い" : "にゃち → うーへ支払い";
  }

  function paidSettlementRecord(monthKey) {
    return (state.data.settlements || []).find(function (x) {
      return monthKeyFromDate(x.settlement_month) === monthKey;
    }) || null;
  }

  function paidDateLabel(value) {
    if (!value) return "支払い済み";
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "支払い済み";
    return date.toLocaleDateString("ja-JP", {
      month:"numeric",
      day:"numeric",
      timeZone:"Asia/Tokyo"
    }) + "に支払い済み";
  }

  function renderPaymentDueCard() {
    var paymentMonth = state.currentMonth;
    var sourceMonth = addMonths(paymentMonth, -1);
    var paidRecord = paidSettlementRecord(sourceMonth);
    var hasSourceMonth = (sourceMonth >= OPERATION_START_MONTH && sourceMonth <= addMonths(actualMonthKey(), -1)) || !!paidRecord;
    var sourceSummary = hasSourceMonth ? calculateSummary(sourceMonth) : null;
    var amount = paidRecord
      ? Number(paidRecord.amount || 0)
      : (sourceSummary ? Number(sourceSummary.finalSettlement || 0) : 0);
    var isPaid = !!paidRecord;

    var card = document.getElementById("paymentDueCard");
    var status = document.getElementById("paymentDueStatus");
    var payButton = document.getElementById("payCurrentSettlementButton");
    var undoButton = document.getElementById("undoPaymentButton");

    document.getElementById("paymentDueTitle").textContent = monthLabel(paymentMonth) + "に払う額";
    document.getElementById("paymentDueSource").textContent = monthLabel(sourceMonth) + "分の精算";
    document.getElementById("paymentDueAmount").textContent = yen(Math.abs(amount));

    card.classList.toggle("paid", isPaid);
    status.classList.remove("unpaid", "paid", "none");

    var hasRepaymentToSettle = !!(sourceSummary && Number(sourceSummary.monthlyRepayment || 0) > 0);

    if (!hasSourceMonth || (amount === 0 && !hasRepaymentToSettle)) {
      status.classList.add("none");
      status.textContent = "支払いなし";
      document.getElementById("paymentDueDirection").textContent =
        hasSourceMonth ? "精算する差額はありません" : monthLabel(sourceMonth) + "分の精算はありません";
      document.getElementById("paymentDueMeta").textContent =
        hasSourceMonth ? "この月に支払う精算額は0円です。" : "前月分の利用データはありません。";
      payButton.classList.add("hidden");
      undoButton.classList.add("hidden");
      return;
    }

    document.getElementById("paymentDueDirection").textContent =
      amount === 0 && hasRepaymentToSettle
        ? "生活費と返済を相殺して、支払いは0円です"
        : directionText(amount);

    if (isPaid) {
      status.classList.add("paid");
      status.textContent = "支払済み";
      document.getElementById("paymentDueMeta").textContent = paidDateLabel(paidRecord.paid_at);
      payButton.classList.remove("hidden");
      payButton.disabled = true;
      payButton.textContent = "支払済み ✓";
      undoButton.classList.remove("hidden");
    } else {
      status.classList.add("unpaid");
      status.textContent = "未払い";
      document.getElementById("paymentDueMeta").textContent =
        monthLabel(sourceMonth) + "分を" + monthLabel(paymentMonth) + "末に精算します。" +
        (sourceSummary && sourceSummary.monthlyRepayment
          ? " 返済 " + yen(sourceSummary.monthlyRepayment) + " を含みます。"
          : "");
      payButton.classList.remove("hidden");
      payButton.disabled = false;
      payButton.textContent = "払ったよー";
      undoButton.classList.add("hidden");
    }
  }

  function render() {
    var summary = calculateSummary();

    var selectedMonthLabel = monthLabel(state.currentMonth);
    var settlementMonth = addMonths(state.currentMonth, 1);
    renderPaymentDueCard();
    document.getElementById("settlementTitle").textContent = selectedMonthLabel + "分の精算見込み";
    document.getElementById("breakdownTitle").textContent = selectedMonthLabel + "分の精算内訳";
    document.getElementById("settlementTiming").textContent =
      fullMonthLabel(settlementMonth) + "末に確定・精算";
    document.getElementById("settlementNote").textContent =
      monthPeriodLabel(state.currentMonth) + "に使った共同支出・返済・繰越を集計しています。";
    document.getElementById("monthlyTotalTitle").textContent = selectedMonthLabel + "分の生活費";
    document.getElementById("monthlyRepaymentTitle").textContent = selectedMonthLabel + "分の返済";
    document.getElementById("monthlyShareTitle").textContent = selectedMonthLabel + "分の負担";
    document.getElementById("monthlySpendingTitle").textContent = selectedMonthLabel + "分の支出";

    document.getElementById("monthlyTotal").textContent = yen(summary.total);
    document.getElementById("myShare").textContent = yen(summary.myShare);
    document.getElementById("partnerShare").textContent = yen(summary.partnerShare);
    document.getElementById("monthlyRepayment").textContent = yen(summary.monthlyRepayment);
    document.getElementById("remainingDebt").textContent = "残り " + yen(summary.plan.remaining_amount);
    document.getElementById("debtRemaining").textContent = yen(summary.plan.remaining_amount);
    document.getElementById("repaymentBadge").textContent = selectedMonthLabel + "分 " + yen(summary.monthlyRepayment);
    document.getElementById("debtMeta").textContent =
      "総額 " + yen(summary.plan.original_amount) + " ・ 返済済 " +
      yen(summary.plan.original_amount - summary.plan.remaining_amount) +
      " ・ " + monthLabel(REPAYMENT_START_MONTH) + "分から返済";

    var progress = summary.plan.original_amount
      ? ((summary.plan.original_amount - summary.plan.remaining_amount) / summary.plan.original_amount * 100)
      : 0;
    document.getElementById("debtProgress").style.width =
      Math.max(0, Math.min(100, progress)) + "%";

    var recent = summary.monthTransactions.slice()
      .sort(function (a,b) { return b.date.localeCompare(a.date); }).slice(0,5);
    document.getElementById("recentTransactions").innerHTML = recent.map(txRow).join("");

    var filtered = summary.monthTransactions.slice()
      .sort(function (a,b) { return b.date.localeCompare(a.date); });
    if (state.filter !== "all") {
      filtered = filtered.filter(function (t) { return t.scope === state.filter; });
    }
    document.getElementById("allTransactions").innerHTML = filtered.map(txRow).join("");

    var nextMonth = addMonths(state.currentMonth, 1);
    var livingOut = carryOutRecord("living");

    document.getElementById("livingCarryoverAmount").textContent =
      yen(Math.abs(summary.livingSettlement));
    document.getElementById("livingCarryoverMeta").textContent =
      summary.livingSettlement === 0
        ? "繰越する差額はありません"
        : directionText(summary.livingSettlement).replace("へ支払い","") +
          (summary.carryInLiving !== 0 ? " ・ 前月繰越含む" : "");

    var livingButton = document.querySelector('[data-carryover="living"]');
    var livingInput = document.getElementById("livingCarryoverInput");
    var livingAvailable = Math.abs(summary.livingSettlement);
    var livingPreset = livingOut ? Math.abs(Number(livingOut.amount || 0)) : 0;
    livingInput.max = String(livingAvailable);
    livingInput.value = String(Math.min(livingAvailable, livingPreset));
    var livingLocked = !!paidSettlementRecord(state.currentMonth);
    livingInput.disabled = livingAvailable === 0 || livingLocked;
    livingButton.disabled = livingAvailable === 0 || livingLocked;

    document.getElementById("livingCarryoverSourceLabel").textContent =
      selectedMonthLabel + "の精算差額";
    document.getElementById("livingNextMonthLabel").textContent =
      monthLabel(nextMonth) + "へ繰越";
    document.getElementById("livingPayNowAmount").textContent =
      yen(Math.max(0, livingAvailable - Math.min(livingAvailable, livingPreset)));
    document.getElementById("livingNextMonthAmount").textContent =
      yen(Math.min(livingAvailable, livingPreset));
    livingButton.textContent = livingLocked
      ? "精算済みのため変更不可"
      : (livingOut ? "繰越額を更新" : "繰越額を保存");
    document.getElementById("cancelLivingCarryoverButton").classList.toggle("hidden", !livingOut || livingLocked);

    var initialExpenses = state.data.initial_expenses || [];
    var initialTotal = initialExpenses.reduce(function (sum, x) {
      return sum + Number(x.amount || 0);
    }, 0);
    var initialMe = initialExpenses.filter(function (x) { return x.payer === "me"; })
      .reduce(function (sum, x) { return sum + Number(x.amount || 0); }, 0);
    var initialPartner = initialExpenses.filter(function (x) { return x.payer === "partner"; })
      .reduce(function (sum, x) { return sum + Number(x.amount || 0); }, 0);

    document.getElementById("initialExpenseTotal").textContent = yen(initialTotal);
    document.getElementById("initialExpenseSplit").textContent =
      "にゃち " + yen(initialMe) + " / うー " + yen(initialPartner);

    var initialDirection = "返済なし";
    if (Number(summary.plan.original_amount || 0) > 0) {
      var lenderName = summary.plan.lender === "me" ? "にゃち" : "うー";
      var borrowerName = summary.plan.borrower === "me" ? "にゃち" : "うー";
      initialDirection = "返済：" + borrowerName + " → " + lenderName;
    }
    document.getElementById("initialExpenseDirection").textContent = initialDirection;

    document.getElementById("initialExpensesList").innerHTML =
      initialExpenses.map(function (x) {
        var detail = shortDate(x.date) + " ・ " +
          (x.payer === "me" ? "にゃちが支払い" : "うーが支払い");
        return '<button type="button" class="transaction-row transaction-edit-row" data-edit-initial-expense="' + x.id + '">' +
          '<div class="tx-icon">↔</div>' +
          '<div class="tx-main"><strong>' + escapeHtml(x.item_name) + '</strong><small>' +
          detail + (x.memo ? " ・ " + escapeHtml(x.memo) : "") +
          '</small></div><div class="tx-side"><div class="tx-amount">' + yen(x.amount) + '</div>' +
          '<span class="tx-edit-label">編集 ›</span></div></button>';
      }).join("");

    var meSharePercent = currentMeSharePercent();
    document.getElementById("shareSettingSummary").textContent =
      "にゃち " + meSharePercent + "% / うー " + (100 - meSharePercent) + "%";
    document.getElementById("categorySettingSummary").textContent =
      state.data.categories.length
        ? state.data.categories.slice(0, 4).map(function (x) { return x.name; }).join("・") +
          (state.data.categories.length > 4 ? " など" : "")
        : "費目はまだありません";
    document.getElementById("merchantRuleSummary").textContent =
      state.data.merchant_rules.length
        ? state.data.merchant_rules.length + "件のルールを登録中"
        : "店舗ルールはまだありません";

    document.getElementById("merchantRules").innerHTML =
      state.data.merchant_rules.length
        ? state.data.merchant_rules.map(function (r) {
            return '<button type="button" class="merchant-row merchant-row-button" data-edit-merchant-rule="' + r.id + '">' +
              '<div><strong>' + escapeHtml(r.merchant_name) +
              '</strong><small>' + (r.mode === "confirm" ? "毎回確認" :
              escapeHtml(r.category_name || "未設定") + " ・ " + scopeLabel(r.scope)) +
              '</small></div><b>›</b></button>';
          }).join("")
        : '<p class="muted">店舗ルールはまだありません。</p>';

    document.getElementById("categorySettingsList").innerHTML =
      state.data.categories.map(function (category) {
        return '<div class="settings-manage-row">' +
          '<input type="text" maxlength="40" value="' + escapeHtml(category.name) +
          '" data-category-input="' + category.id + '">' +
          '<button type="button" class="settings-mini-button" data-category-save="' + category.id + '">保存</button>' +
          '<button type="button" class="settings-mini-button danger" data-category-delete="' + category.id + '">削除</button>' +
          '</div>';
      }).join("");

    var categoryOptions = state.data.categories.map(function (c) {
      return '<option value="' + escapeHtml(c.name) + '">' +
        escapeHtml(c.name) + '</option>';
    }).join("");
    document.getElementById("classifyCategory").innerHTML = categoryOptions;
    document.getElementById("manualExpenseCategory").innerHTML = categoryOptions;
    document.getElementById("merchantRuleCategory").innerHTML = categoryOptions;

    document.getElementById("settlementAmount").textContent =
      yen(Math.abs(summary.finalSettlement));
    document.getElementById("settlementDirection").textContent =
      directionText(summary.finalSettlement);

    renderHomeCategoryChart(summary);
    renderAnalysisChart();

    var carryoverNet = Number(summary.carryInLiving || 0) - Number(summary.livingCarryOut || 0);
    var livingBreakdownDirection = summary.livingCurrent === 0
      ? "なし"
      : directionText(summary.livingCurrent).replace("へ支払い","");
    var repaymentBreakdownDirection = summary.repaymentNet === 0
      ? "なし"
      : directionText(summary.repaymentNet).replace("へ支払い","");
    var carryoverBreakdownMeta;
    if (summary.carryInLiving !== 0 && summary.livingCarryOut !== 0) {
      carryoverBreakdownMeta =
        "前月から " + yen(Math.abs(summary.carryInLiving)) +
        " / 翌月へ " + yen(Math.abs(summary.livingCarryOut));
    } else if (summary.carryInLiving !== 0) {
      carryoverBreakdownMeta =
        "前月から・" + directionText(summary.carryInLiving).replace("へ支払い","");
    } else if (summary.livingCarryOut !== 0) {
      carryoverBreakdownMeta = "翌月へ繰越";
    } else {
      carryoverBreakdownMeta = "なし";
    }

    document.getElementById("breakdownList").innerHTML =
      '<div class="breakdown-row"><span>生活費の差額<small>' +
      livingBreakdownDirection +
      '</small></span><strong>' + yen(Math.abs(summary.livingCurrent)) + '</strong></div>' +
      '<div class="breakdown-row"><span>立替金返済<small>' +
      repaymentBreakdownDirection +
      '</small></span><strong>' + yen(Math.abs(summary.repaymentNet)) + '</strong></div>' +
      '<div class="breakdown-row"><span>繰越金<small>' +
      carryoverBreakdownMeta +
      '</small></span><strong>' + yen(Math.abs(carryoverNet)) + '</strong></div>';

    bindDynamicButtons();
  }

  function openTransactionEditor(id, mode) {
    var tx = state.data.transactions.find(function (x) {
      return Number(x.id) === Number(id);
    });
    if (!tx) return;

    state.currentClassifyId = Number(id);
    document.getElementById("classifyId").value = Number(id);
    document.getElementById("classifyTitle").textContent =
      tx.merchant_name + (mode === "classify" ? " を分類" : " を編集");
    document.getElementById("classifyDate").value = tx.date || "";
    document.getElementById("classifyMerchantName").value = tx.merchant_name || "";
    document.getElementById("classifyAmount").value = String(tx.amount == null ? "" : tx.amount);
    document.getElementById("classifyCategory").value = tx.category_name || "";
    document.getElementById("classifyScope").value = tx.scope || "shared";
    document.getElementById("classifyPayer").value = tx.payer || "me";
    document.getElementById("classifyMemo").value = tx.memo || "";
    document.getElementById("ruleMode").value = "once";
    document.getElementById("classifyDialog").showModal();
  }

  function openInitialExpenseEditor(id) {
    var expense = (state.data.initial_expenses || []).find(function (x) {
      return Number(x.id) === Number(id);
    });
    if (!expense) return;

    document.getElementById("initialExpenseId").value = expense.id;
    document.getElementById("initialExpenseDialogTitle").textContent = expense.item_name + " を編集";
    document.getElementById("initialExpenseItem").value = expense.item_name || "";
    document.getElementById("initialExpenseAmount").value = expense.amount || "";
    document.getElementById("initialExpensePayer").value = expense.payer || "me";
    document.getElementById("initialExpenseDate").value = expense.date || "";
    document.getElementById("initialExpenseMemo").value = expense.memo || "";
    document.getElementById("initialExpenseSaveButton").textContent = "変更を保存";
    document.getElementById("deleteInitialExpenseButton").classList.remove("hidden");
    document.getElementById("initialExpenseDialog").showModal();
  }

  function openInitialExpenseAdd() {
    document.getElementById("initialExpenseForm").reset();
    document.getElementById("initialExpenseId").value = "";
    document.getElementById("initialExpenseDialogTitle").textContent = "立替金を追加";
    document.getElementById("initialExpenseSaveButton").textContent = "保存する";
    document.getElementById("deleteInitialExpenseButton").classList.add("hidden");
    setDefaultEntryDates(true);
    document.getElementById("initialExpenseDialog").showModal();
  }

  function updateSharePreview(value) {
    var percent = Number(value);
    if (!Number.isFinite(percent)) percent = currentMeSharePercent();
    percent = Math.max(0, Math.min(100, Math.round(percent)));
    document.getElementById("meSharePreview").textContent = percent + "%";
    document.getElementById("partnerSharePreview").textContent = (100 - percent) + "%";
  }

  function openShareSettings() {
    var percent = currentMeSharePercent();
    document.getElementById("meSharePercent").value = String(percent);
    updateSharePreview(percent);
    document.getElementById("shareSettingsDialog").showModal();
  }

  function syncMerchantRuleFields() {
    var auto = document.getElementById("merchantRuleMode").value === "auto";
    document.getElementById("merchantRuleCategoryLabel").classList.toggle("hidden", !auto);
    document.getElementById("merchantRuleCategory").required = auto;
  }

  function openMerchantRuleAdd() {
    document.getElementById("merchantRuleForm").reset();
    document.getElementById("merchantRuleId").value = "";
    document.getElementById("merchantRuleDialogTitle").textContent = "店舗ルールを追加";
    document.getElementById("merchantRuleSaveButton").textContent = "保存する";
    document.getElementById("deleteMerchantRuleButton").classList.add("hidden");
    document.getElementById("merchantRuleMode").value = "auto";
    document.getElementById("merchantRuleScope").value = "shared";
    syncMerchantRuleFields();
    document.getElementById("merchantRuleDialog").showModal();
  }

  function openMerchantRuleEditor(id) {
    var rule = state.data.merchant_rules.find(function (x) {
      return Number(x.id) === Number(id);
    });
    if (!rule) return;

    document.getElementById("merchantRuleId").value = String(rule.id);
    document.getElementById("merchantRuleDialogTitle").textContent = rule.merchant_name + " のルール";
    document.getElementById("merchantRuleName").value = rule.merchant_name || "";
    document.getElementById("merchantRuleMode").value = rule.mode || "auto";
    document.getElementById("merchantRuleScope").value = rule.scope || "shared";
    if (rule.category_name) {
      document.getElementById("merchantRuleCategory").value = rule.category_name;
    }
    document.getElementById("merchantRuleSaveButton").textContent = "変更を保存";
    document.getElementById("deleteMerchantRuleButton").classList.remove("hidden");
    syncMerchantRuleFields();
    document.getElementById("merchantRuleDialog").showModal();
  }

  function bindDynamicButtons() {
    document.querySelectorAll("[data-classify]").forEach(function (button) {
      button.onclick = function () {
        openTransactionEditor(Number(button.getAttribute("data-classify")), "classify");
      };
    });

    document.querySelectorAll("[data-edit-tx]").forEach(function (button) {
      button.onclick = function () {
        openTransactionEditor(Number(button.getAttribute("data-edit-tx")), "edit");
      };
    });

    document.querySelectorAll("[data-edit-initial-expense]").forEach(function (button) {
      button.onclick = function () {
        openInitialExpenseEditor(Number(button.getAttribute("data-edit-initial-expense")));
      };
    });

    document.querySelectorAll("[data-edit-merchant-rule]").forEach(function (button) {
      button.onclick = function () {
        openMerchantRuleEditor(Number(button.getAttribute("data-edit-merchant-rule")));
      };
    });

    document.querySelectorAll("[data-category-save]").forEach(function (button) {
      button.onclick = async function () {
        var id = Number(button.getAttribute("data-category-save"));
        var input = document.querySelector('[data-category-input="' + id + '"]');
        var value = input ? input.value.trim() : "";
        if (!value) return;
        button.disabled = true;
        try {
          await window.kakeiboDb.updateCategory(id, value);
          state.data = await window.kakeiboDb.getInitialData();
          render();
        } catch (error) {
          console.error(error);
          alert(error && error.code === "23505"
            ? "同じ名前の費目がすでにあります。"
            : "費目を変更できませんでした。");
        } finally {
          button.disabled = false;
        }
      };
    });

    document.querySelectorAll("[data-category-delete]").forEach(function (button) {
      button.onclick = async function () {
        var id = Number(button.getAttribute("data-category-delete"));
        var category = state.data.categories.find(function (x) {
          return Number(x.id) === id;
        });
        if (!category) return;
        var ok = window.confirm(
          "「" + category.name + "」を削除しますか？\n" +
          "この費目を使っている明細や店舗ルールは「未設定」になります。"
        );
        if (!ok) return;

        button.disabled = true;
        try {
          await window.kakeiboDb.deleteCategory(id);
          state.data = await window.kakeiboDb.getInitialData();
          render();
        } catch (error) {
          console.error(error);
          alert("費目を削除できませんでした。");
        } finally {
          button.disabled = false;
        }
      };
    });

  }

  function initMonthSelect() {
    var select = document.getElementById("monthSelect");
    if (!select) return;

    var startMonth = OPERATION_START_MONTH;
    var endMonth = maxSelectableMonth();
    var options = [];
    var key = startMonth;
    var guard = 0;

    while (key <= endMonth && guard < 120) {
      options.push('<option value="' + key + '">' +
        key.split("-")[0] + "年" + Number(key.split("-")[1]) + "月分</option>");
      key = addMonths(key, 1);
      guard += 1;
    }

    select.innerHTML = options.join("");
    if (state.currentMonth < startMonth || state.currentMonth > endMonth) {
      state.currentMonth = endMonth;
    }
    select.value = state.currentMonth;
  }

  function isIOSViewport() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  var floatingUiFrame = null;

  function syncFloatingUi() {
    floatingUiFrame = null;
    if (!isIOSViewport()) return;

    var shell = document.getElementById("appShell");
    if (!shell || shell.classList.contains("hidden")) return;

    var viewport = window.visualViewport;
    var pageTop = viewport ? viewport.pageTop : window.scrollY;
    var viewportHeight = viewport ? viewport.height : window.innerHeight;
    var shellPageTop = shell.getBoundingClientRect().top + window.scrollY;

    var nav = document.querySelector(".bottom-nav");
    var fab = document.querySelector(".fab");
    var navHeight = 0;

    if (nav) {
      nav.style.position = "absolute";
      nav.style.bottom = "auto";
      navHeight = nav.offsetHeight || 64;
      nav.style.top = Math.max(
        0,
        pageTop + viewportHeight - navHeight - shellPageTop
      ) + "px";
    }

    if (fab) {
      fab.style.position = "absolute";
      fab.style.bottom = "auto";
      var fabHeight = fab.offsetHeight || 56;
      fab.style.top = Math.max(
        0,
        pageTop + viewportHeight - navHeight - fabHeight - 12 - shellPageTop
      ) + "px";
      fab.style.right = "18px";
    }
  }

  function scheduleFloatingUiSync() {
    if (floatingUiFrame != null) return;
    floatingUiFrame = window.requestAnimationFrame(syncFloatingUi);
  }

  window.addEventListener("scroll", scheduleFloatingUiSync, { passive:true });
  window.addEventListener("resize", scheduleFloatingUiSync, { passive:true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("scroll", scheduleFloatingUiSync, { passive:true });
    window.visualViewport.addEventListener("resize", scheduleFloatingUiSync, { passive:true });
  }

  function go(screen) {
    document.querySelectorAll(".screen").forEach(function (x) {
      x.classList.toggle("active", x.getAttribute("data-screen") === screen);
    });
    document.querySelectorAll(".nav-item").forEach(function (x) {
      x.classList.toggle("active", x.getAttribute("data-go") === screen);
    });
    window.scrollTo({ top:0, behavior:"smooth" });
    window.setTimeout(scheduleFloatingUiSync, 0);
    window.setTimeout(scheduleFloatingUiSync, 250);
  }

  document.querySelectorAll("[data-go]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.classList.contains("nav-item")) {
        button.classList.remove("nav-bounce");
        void button.offsetWidth;
        button.classList.add("nav-bounce");
        window.setTimeout(function () {
          button.classList.remove("nav-bounce");
        }, 360);
      }
      go(button.getAttribute("data-go"));
    });
  });

  document.querySelectorAll("[data-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      var dialog = document.getElementById(button.getAttribute("data-open"));
      if (dialog) dialog.showModal();
    });
  });

  document.querySelectorAll("[data-open-initial-expense]").forEach(function (button) {
    button.addEventListener("click", function () {
      openInitialExpenseAdd();
    });
  });

  document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
    button.addEventListener("click", function () {
      var dialog = button.closest("dialog");
      if (dialog) dialog.close();
    });
  });

  document.querySelectorAll("[data-switch-dialog]").forEach(function (button) {
    button.addEventListener("click", function () {
      var currentDialog = button.closest("dialog");
      if (currentDialog) currentDialog.close();
      var target = document.getElementById(button.getAttribute("data-switch-dialog"));
      if (target) target.showModal();
    });
  });

  document.getElementById("shareSettingsButton").addEventListener("click", openShareSettings);
  document.getElementById("categorySettingsButton").addEventListener("click", function () {
    document.getElementById("categorySettingsDialog").showModal();
  });
  document.getElementById("merchantSettingsButton").addEventListener("click", openMerchantRuleAdd);
  document.getElementById("addMerchantRuleButton").addEventListener("click", openMerchantRuleAdd);
  document.getElementById("auditHistoryButton").addEventListener("click", openAuditHistory);

  document.getElementById("meSharePercent").addEventListener("input", function (event) {
    updateSharePreview(event.target.value);
  });

  document.getElementById("shareSettingsForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var input = document.getElementById("meSharePercent");
    var percent = Number(input.value);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      alert("0〜100の整数で入力してください。");
      return;
    }

    var button = event.submitter;
    if (button) button.disabled = true;
    try {
      await window.kakeiboDb.saveAppSettings(percent);
      state.data = await window.kakeiboDb.getInitialData();
      document.getElementById("shareSettingsDialog").close();
      render();
    } catch (error) {
      console.error(error);
      alert("負担割合を保存できませんでした。");
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById("categoryAddForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var input = document.getElementById("newCategoryName");
    var name = input.value.trim();
    if (!name) return;

    var button = event.submitter;
    if (button) button.disabled = true;
    try {
      await window.kakeiboDb.addCategory(name);
      state.data = await window.kakeiboDb.getInitialData();
      input.value = "";
      render();
    } catch (error) {
      console.error(error);
      alert(error && error.code === "23505"
        ? "同じ名前の費目がすでにあります。"
        : "費目を追加できませんでした。");
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById("merchantRuleMode").addEventListener("change", syncMerchantRuleFields);

  document.getElementById("merchantRuleForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var mode = document.getElementById("merchantRuleMode").value;
    var rule = {
      id:Number(document.getElementById("merchantRuleId").value || 0) || null,
      merchant_name:document.getElementById("merchantRuleName").value.trim(),
      mode:mode,
      category_name:mode === "auto" ? document.getElementById("merchantRuleCategory").value : null,
      scope:document.getElementById("merchantRuleScope").value
    };
    if (!rule.merchant_name || (mode === "auto" && !rule.category_name)) return;

    var button = event.submitter;
    if (button) button.disabled = true;
    try {
      await window.kakeiboDb.saveMerchantRule(rule);
      state.data = await window.kakeiboDb.getInitialData();
      document.getElementById("merchantRuleDialog").close();
      render();
    } catch (error) {
      console.error(error);
      alert("店舗ルールを保存できませんでした。");
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById("deleteMerchantRuleButton").addEventListener("click", async function () {
    var id = Number(document.getElementById("merchantRuleId").value || 0);
    var rule = state.data.merchant_rules.find(function (x) {
      return Number(x.id) === id;
    });
    if (!id || !rule) return;
    if (!window.confirm("「" + rule.merchant_name + "」の店舗ルールを削除しますか？")) return;

    try {
      await window.kakeiboDb.deleteMerchantRule(id);
      state.data = await window.kakeiboDb.getInitialData();
      document.getElementById("merchantRuleDialog").close();
      render();
    } catch (error) {
      console.error(error);
      alert("店舗ルールを削除できませんでした。");
    }
  });

  document.getElementById("csvCardCompany").addEventListener("change", function () {
    state.csvRows = [];
    var input = document.getElementById("csvFileInput");
    var review = document.getElementById("csvReviewArea");
    var message = document.getElementById("csvFileMessage");
    if (input) input.value = "";
    if (review) review.classList.add("hidden");
    if (message) {
      message.classList.remove("error");
      message.textContent = this.value
        ? (this.value === "rakuten"
          ? "楽天カードの明細ファイルを選んでください。"
          : "エポスカードの明細ファイルを選んでください。")
        : "先にカード会社を選んでください。";
    }
  });

  document.getElementById("csvFileInput").addEventListener("change", async function (event) {
    var file = event.target.files && event.target.files[0];
    var message = document.getElementById("csvFileMessage");
    var review = document.getElementById("csvReviewArea");
    var cardCompany = document.getElementById("csvCardCompany").value;

    state.csvRows = [];
    review.classList.add("hidden");
    message.classList.remove("error");

    if (!file) {
      message.textContent = "まだファイルは選ばれていません。";
      return;
    }

    if (!cardCompany) {
      message.classList.add("error");
      message.textContent = "先にカード会社を選んでください。";
      event.target.value = "";
      return;
    }

    var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    var isCsv = file.type === "text/csv" || /\.csv$/i.test(file.name);

    if (!isPdf && !isCsv) {
      message.classList.add("error");
      message.textContent = "PDFまたはCSVファイルを選んでください。";
      return;
    }

    state.importFileType = isPdf ? "pdf" : "csv";
    message.textContent = isPdf ? "PDFを確認しています…" : "CSVを確認しています…";

    try {
      var buffer = await file.arrayBuffer();
      var parsed;

      if (isPdf) {
        parsed = await buildPdfRows(buffer, function (progressText) {
          message.textContent = progressText;
        }, cardCompany);
      } else {
        var decoded = decodeCsvBuffer(buffer);
        parsed = buildCsvRows(decoded);
      }

      state.csvRows = parsed.rows;

      if (!state.csvRows.length) {
        throw new Error("登録できる明細が見つかりませんでした。");
      }

      message.textContent = file.name + " ・ " + state.csvRows.length + "件を読み込み" +
        (parsed.ignored ? "（" + parsed.ignored + "行は自動判定できず除外）" : "");
      review.classList.remove("hidden");
      renderCsvReview();
      window.setTimeout(scheduleFloatingUiSync, 0);
      window.setTimeout(scheduleFloatingUiSync, 300);
    } catch (error) {
      console.error(error);
      message.classList.add("error");
      message.textContent = error && error.message
        ? error.message
        : "明細ファイルを読み込めませんでした。";
    }
  });

  document.getElementById("csvSelectNewButton").addEventListener("click", function () {
    var rows = state.csvRows.filter(function (row) { return !row.duplicate; });
    var allSelected = rows.length && rows.every(function (row) { return row.selected; });
    setCsvGroupSelection(false, !allSelected);
  });

  document.getElementById("csvSelectDuplicateButton").addEventListener("click", function () {
    var rows = state.csvRows.filter(function (row) { return row.duplicate; });
    var allSelected = rows.length && rows.every(function (row) { return row.selected; });
    setCsvGroupSelection(true, !allSelected);
  });

  document.getElementById("csvImportButton").addEventListener("click", async function () {
    var selected = state.csvRows.filter(function (row) { return row.selected; });
    if (!selected.length) return;

    var payer = document.getElementById("csvPayer").value;
    var button = document.getElementById("csvImportButton");
    var originalText = button.textContent;
    button.disabled = true;
    button.textContent = "反映しています…";

    var payload = selected.map(function (row) {
      return {
        date:row.date,
        merchant_name:row.merchant_name,
        merchant_raw:row.merchant_raw,
        amount:row.amount,
        category_name:row.category_name,
        scope:row.scope,
        payer:payer,
        memo:state.importFileType === "pdf" ? "PDF取込" : "CSV取込"
      };
    });

    try {
      await window.kakeiboDb.importCsvTransactions(payload);

      var importedMonths = selected.map(function (row) {
        return monthKeyFromDate(row.date);
      }).filter(Boolean).sort();
      var latestImportedMonth = importedMonths.length
        ? importedMonths[importedMonths.length - 1]
        : state.currentMonth;

      state.data = await window.kakeiboDb.getInitialData();
      state.currentMonth = latestImportedMonth;
      initMonthSelect();
      setDefaultEntryDates(true);
      render();
      document.getElementById("csvImportDialog").close();
      resetCsvImport();
      go("transactions");
      alert(
        selected.length + "件を家計簿に反映しました。" +
        (latestImportedMonth ? " " + monthLabel(latestImportedMonth) + "を表示します。" : "")
      );
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = originalText;
      alert("CSV明細を保存できませんでした。");
    }
  });

  document.getElementById("monthSelect").addEventListener("change", function (event) {
    state.currentMonth = event.target.value;
    setDefaultEntryDates(true);
    render();
  });

  document.getElementById("payCurrentSettlementButton").addEventListener("click", async function () {
    var sourceMonth = addMonths(state.currentMonth, -1);
    if (sourceMonth < earliestAvailableMonth()) return;
    if (paidSettlementRecord(sourceMonth)) return;

    var summary = calculateSummary(sourceMonth);
    var amount = Number(summary.finalSettlement || 0);
    var repaymentAmount = Number(summary.monthlyRepayment || 0);
    if (!amount && !repaymentAmount) return;

    var settlementDirection = amount === 0
      ? "生活費と返済を相殺して、支払いは0円"
      : directionText(amount);

    var ok = window.confirm(
      monthLabel(sourceMonth) + "分 " + yen(Math.abs(amount)) + "\n" +
      settlementDirection +
      (repaymentAmount ? "\n返済 " + yen(repaymentAmount) + " を含みます" : "") +
      "\n\n精算済みにしますか？"
    );
    if (!ok) return;

    var button = document.getElementById("payCurrentSettlementButton");
    button.disabled = true;
    button.textContent = "保存しています…";

    try {
      await window.kakeiboDb.markSettlementPaid(
        sourceMonth,
        amount,
        summary.plan ? summary.plan.id : null,
        repaymentAmount
      );
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (e) {
      console.error(e);
      button.disabled = false;
      button.textContent = "払ったよー";
      alert("支払い済みにできませんでした。");
    }
  });

  document.getElementById("undoPaymentButton").addEventListener("click", async function () {
    var sourceMonth = addMonths(state.currentMonth, -1);
    var record = paidSettlementRecord(sourceMonth);
    if (!record) return;

    var ok = window.confirm(
      monthLabel(sourceMonth) + "分の支払い済み記録を取り消しますか？"
    );
    if (!ok) return;

    try {
      await window.kakeiboDb.undoSettlementPaid(sourceMonth);
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (e) {
      console.error(e);
      alert("支払い済み記録を取り消せませんでした。");
    }
  });

  document.getElementById("livingCarryoverInput").addEventListener("input", function (event) {
    var summary = calculateSummary();
    var available = Math.abs(summary.livingSettlement);
    var selected = Number(event.target.value || 0);
    if (!Number.isFinite(selected) || selected < 0) selected = 0;
    selected = Math.min(available, selected);
    document.getElementById("livingPayNowAmount").textContent = yen(available - selected);
    document.getElementById("livingNextMonthAmount").textContent = yen(selected);
  });

  document.getElementById("cancelLivingCarryoverButton").addEventListener("click", async function () {
    var livingOut = carryOutRecord("living");
    if (!livingOut) return;

    var nextMonth = addMonths(state.currentMonth, 1);
    var ok = window.confirm(
      monthLabel(state.currentMonth) + "から" + monthLabel(nextMonth) + "への繰越 " +
      yen(Math.abs(Number(livingOut.amount || 0))) + " を取り消しますか？\n" +
      "取り消した分は " + monthLabel(state.currentMonth) + " の精算額に戻ります。"
    );
    if (!ok) return;

    try {
      await window.kakeiboDb.deleteCarryover("living", state.currentMonth);
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (e) {
      console.error(e);
      alert("繰越を取り消せませんでした。");
    }
  });

  document.querySelectorAll("[data-carryover]").forEach(function (button) {
    button.addEventListener("click", async function () {
      var category = button.getAttribute("data-carryover");
      if (category !== "living") return;
      var summary = calculateSummary();
      var available = Math.abs(summary.livingSettlement);
      if (!available) return;

      var selectedAmount = Number(document.getElementById("livingCarryoverInput").value || 0);
      if (!Number.isFinite(selectedAmount) || selectedAmount < 0) {
        alert("繰越する金額を入力してください。");
        return;
      }
      if (selectedAmount > available) {
        alert("繰越できるのは " + yen(available) + " までです。");
        return;
      }

      var baseAmount = summary.livingSettlement;
      var amount = baseAmount < 0 ? -selectedAmount : selectedAmount;
      var label = "生活費の精算差額";
      var nextMonth = addMonths(state.currentMonth, 1);
      var payNow = available - selectedAmount;
      var ok = window.confirm(
        monthLabel(state.currentMonth) + "の" + label + " " + yen(available) + " のうち\n" +
        "今月支払う：" + yen(payNow) + "\n" +
        monthLabel(nextMonth) + "へ繰越：" + yen(selectedAmount) + "\n\n" +
        "この内容で保存しますか？"
      );
      if (!ok) return;

      try {
        await window.kakeiboDb.saveCarryover(category, state.currentMonth, amount);
        state.data = await window.kakeiboDb.getInitialData();
        render();
      } catch (e) {
        console.error(e);
        alert("繰越を保存できませんでした。");
      }
    });
  });

  document.querySelectorAll(".chip").forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll(".chip").forEach(function (x) {
        x.classList.remove("active");
      });
      button.classList.add("active");
      state.filter = button.getAttribute("data-filter");
      render();
    });
  });

  document.getElementById("deleteTransactionButton").addEventListener("click", async function () {
    var id = Number(document.getElementById("classifyId").value);
    var tx = state.data.transactions.find(function (x) {
      return Number(x.id) === id;
    });
    if (!tx) return;

    var ok = window.confirm("「" + tx.merchant_name + "」" + yen(tx.amount) + " を削除しますか？\nこの操作は元に戻せません。");
    if (!ok) return;

    try {
      await window.kakeiboDb.deleteTransaction(id);
      document.getElementById("classifyDialog").close();
      state.currentClassifyId = null;
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (e) {
      console.error(e);
      alert("明細を削除できませんでした。");
    }
  });

  document.getElementById("classifyForm").addEventListener("submit", async function () {
    var id = Number(document.getElementById("classifyId").value);
    var category = document.getElementById("classifyCategory").value;
    var scope = document.getElementById("classifyScope").value;
    var payer = document.getElementById("classifyPayer").value;
    var remember = document.getElementById("ruleMode").value === "merchant";

    var tx = state.data.transactions.find(function (x) {
      return Number(x.id) === id;
    });
    if (tx) {
      tx.category_name = category;
      tx.scope = scope;
      tx.payer = payer;
      tx.status = "confirmed";
      if (remember) {
        state.data.merchant_rules.push({
          id:"local-" + Date.now(),
          merchant_name:tx.merchant_name,
          category_name:category,
          scope:scope,
          mode:"auto"
        });
      }
    }

    try {
      await window.kakeiboDb.classifyTransaction(id, category, scope, payer, remember);
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (e) {
      console.error(e);
      alert("明細の変更を保存できませんでした。");
    }
  });

  document.getElementById("manualExpenseForm").addEventListener("submit", async function () {
    var tx = {
      date: document.getElementById("manualExpenseDate").value,
      merchant_name: document.getElementById("manualExpenseName").value.trim(),
      amount: Number(document.getElementById("manualExpenseAmount").value || 0),
      category_name: document.getElementById("manualExpenseCategory").value,
      scope: document.getElementById("manualExpenseScope").value,
      payer: document.getElementById("manualExpensePayer").value,
      memo: document.getElementById("manualExpenseMemo").value.trim()
    };

    if (!tx.date || !tx.merchant_name || tx.amount < 0 || !tx.category_name) return;

    try {
      await window.kakeiboDb.addManualTransaction(tx);
      state.data = await window.kakeiboDb.getInitialData();
      document.getElementById("manualExpenseForm").reset();
      setDefaultEntryDates();
      render();
    } catch (e) {
      console.error(e);
      alert("支出を保存できませんでした。");
    }
  });

  document.getElementById("initialExpenseForm").addEventListener("submit", async function () {
    var id = Number(document.getElementById("initialExpenseId").value || 0);
    var expense = {
      item_name: document.getElementById("initialExpenseItem").value.trim(),
      amount: Number(document.getElementById("initialExpenseAmount").value || 0),
      payer: document.getElementById("initialExpensePayer").value,
      date: document.getElementById("initialExpenseDate").value,
      memo: document.getElementById("initialExpenseMemo").value.trim()
    };

    if (!expense.item_name || !expense.date || expense.amount <= 0) return;

    try {
      if (id) {
        await window.kakeiboDb.updateInitialExpense(id, expense);
      } else {
        await window.kakeiboDb.addInitialExpense(expense);
      }
      state.data = await window.kakeiboDb.getInitialData();
      document.getElementById("initialExpenseForm").reset();
      document.getElementById("initialExpenseId").value = "";
      document.getElementById("deleteInitialExpenseButton").classList.add("hidden");
      setDefaultEntryDates();
      render();
    } catch (e) {
      console.error(e);
      alert("立替金を保存できませんでした。");
    }
  });

  document.getElementById("deleteInitialExpenseButton").addEventListener("click", async function () {
    var id = Number(document.getElementById("initialExpenseId").value || 0);
    var expense = (state.data.initial_expenses || []).find(function (x) {
      return Number(x.id) === id;
    });
    if (!id || !expense) return;

    var ok = window.confirm("「" + expense.item_name + "」" + yen(expense.amount) + " を削除しますか？\n返済残高も再計算されます。");
    if (!ok) return;

    try {
      await window.kakeiboDb.deleteInitialExpense(id);
      document.getElementById("initialExpenseDialog").close();
      document.getElementById("initialExpenseForm").reset();
      document.getElementById("initialExpenseId").value = "";
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (e) {
      console.error(e);
      alert("立替金を削除できませんでした。");
    }
  });

  function setDefaultEntryDates(force) {
    var now = new Date();
    var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    var today = local.toISOString().slice(0, 10);
    var actualMonth = today.slice(0, 7);
    var defaultDate = actualMonth === state.currentMonth
      ? today
      : state.currentMonth + "-01";

    ["manualExpenseDate", "initialExpenseDate"].forEach(function (id) {
      var input = document.getElementById(id);
      if (input && (force || !input.value)) input.value = defaultDate;
    });
  }

  var repaymentOpenButton = document.querySelector('[data-open="repaymentDialog"]');
  if (repaymentOpenButton) {
    repaymentOpenButton.addEventListener("click", function () {
      document.getElementById("repaymentInput").value =
        String(calculateSummary().monthlyRepayment || 0);
    });
  }

  document.getElementById("repaymentForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var amount = Number(document.getElementById("repaymentInput").value || 0);
    if (!Number.isFinite(amount) || amount < 0 || !state.data.repayment_plan) return;

    var button = event.submitter;
    if (button) button.disabled = true;
    try {
      await window.kakeiboDb.saveMonthlyRepaymentAmount(
        state.data.repayment_plan.id,
        state.currentMonth,
        amount
      );
      state.data = await window.kakeiboDb.getInitialData();
      document.getElementById("repaymentDialog").close();
      render();
    } catch (e) {
      console.error(e);
      alert("この月の返済額を保存できませんでした。");
    } finally {
      if (button) button.disabled = false;
    }
  });

  async function start() {
    if (state.started) return;
    state.started = true;

    try {
      state.data = await window.kakeiboDb.getInitialData();
      initMonthSelect();
      setDefaultEntryDates();
      render();
    } catch (error) {
      state.started = false;
      console.error(error);
      throw error;
    }
  }

  function reset() {
    state.data = null;
    state.started = false;
    state.filter = "all";
    state.currentClassifyId = null;
    state.csvRows = [];
    state.importFileType = "csv";
    state.currentMonth = defaultMonthKey();
  }

  window.KakeiboApp = {
    start: start,
    reset: reset
  };
})();
