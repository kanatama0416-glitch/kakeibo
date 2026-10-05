(function () {
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  var data = {
    categories: [
      { id:1, name:"食費", icon:"🛒" },
      { id:2, name:"日用品", icon:"🧴" },
      { id:3, name:"光熱費", icon:"💡" },
      { id:4, name:"外食", icon:"☕" },
      { id:5, name:"家具・家電", icon:"🪑" },
      { id:6, name:"交通", icon:"🚃" }
    ],
    merchant_rules: [
      { id:1, merchant_name:"スーパー", category_name:"食費", scope:"shared", mode:"auto" },
      { id:2, merchant_name:"ドラッグストア", category_name:"日用品", scope:"shared", mode:"auto" }
    ],
    transactions: [
      { id:101, date:"2026-10-03", merchant_name:"スーパー", amount:4200, category_name:"食費", scope:"shared", payer:"me", status:"confirmed", source:"csv", memo:"CSV取込", card_provider:"rakuten", card_label:"楽天カード", card_id:1, import_batch_id:1, created_at:"2026-10-03T00:42:00.000Z" },
      { id:102, date:"2026-10-08", merchant_name:"電気", amount:6800, category_name:"光熱費", scope:"shared", payer:"partner", status:"confirmed", source:"pdf", memo:"PDF取込", card_provider:"epos", card_label:"エポスカード", card_id:2, import_batch_id:2, created_at:"2026-10-12T12:18:00.000Z" },
      { id:103, date:"2026-10-13", merchant_name:"カフェ", amount:1800, category_name:"外食", scope:"mine", payer:"me", status:"confirmed", source:"manual", memo:"テスト" },
      { id:104, date:"2026-10-21", merchant_name:"ドラッグストア", amount:2600, category_name:"日用品", scope:"shared", payer:"me", status:"confirmed", source:"manual", memo:"テスト" },
      { id:105, date:"2026-10-26", merchant_name:"家具", amount:9500, category_name:"家具・家電", scope:"shared", payer:"partner", status:"confirmed", source:"manual", memo:"テスト" },

      { id:201, date:"2026-11-02", merchant_name:"スーパー", amount:5100, category_name:"食費", scope:"shared", payer:"partner", status:"confirmed", source:"manual", memo:"テスト" },
      { id:202, date:"2026-11-07", merchant_name:"ガス", amount:4300, category_name:"光熱費", scope:"shared", payer:"me", status:"confirmed", source:"manual", memo:"テスト" },
      { id:203, date:"2026-11-14", merchant_name:"ランチ", amount:3200, category_name:"外食", scope:"shared", payer:"me", status:"confirmed", source:"manual", memo:"テスト" },
      { id:204, date:"2026-11-20", merchant_name:"ドラッグストア", amount:2100, category_name:"日用品", scope:"shared", payer:"partner", status:"confirmed", source:"manual", memo:"テスト" },
      { id:205, date:"2026-11-27", merchant_name:"電車", amount:1600, category_name:"交通", scope:"mine", payer:"me", status:"confirmed", source:"manual", memo:"テスト" },

      { id:301, date:"2026-12-01", merchant_name:"スーパー", amount:7600, category_name:"食費", scope:"shared", payer:"me", status:"confirmed", source:"manual", memo:"テスト" },
      { id:302, date:"2026-12-05", merchant_name:"電気", amount:8200, category_name:"光熱費", scope:"shared", payer:"partner", status:"confirmed", source:"manual", memo:"テスト" },
      { id:303, date:"2026-12-12", merchant_name:"ディナー", amount:6200, category_name:"外食", scope:"shared", payer:"partner", status:"confirmed", source:"manual", memo:"テスト" },
      { id:304, date:"2026-12-18", merchant_name:"日用品", amount:3400, category_name:"日用品", scope:"shared", payer:"me", status:"confirmed", source:"manual", memo:"テスト" },
      { id:305, date:"2026-12-24", merchant_name:"家電", amount:12800, category_name:"家具・家電", scope:"shared", payer:"me", status:"confirmed", source:"manual", memo:"テスト" }
    ],
    repayment_plan: {
      id:1,
      title:"テスト立替金",
      original_amount:120000,
      remaining_amount:105000,
      monthly_amount:5000,
      lender:"me",
      borrower:"partner"
    },
    initial_expenses: [
      { id:1, date:"2026-10-01", item_name:"テスト初期費用", amount:120000, payer:"me", memo:"テスト環境" }
    ],
    carryovers: [],
    settings: { id:1, me_share_percent:50, updated_at:null },
    settlements: [],
    repayment_amounts: [
      { id:1, repayment_plan_id:1, repayment_month:"2026-10-01", amount:5000 },
      { id:2, repayment_plan_id:1, repayment_month:"2026-11-01", amount:5000 },
      { id:3, repayment_plan_id:1, repayment_month:"2026-12-01", amount:5000 }
    ],
    repayments: [],
    cards: [
      { id:1, owner:"me", provider:"rakuten", name:"楽天カード", last4:"1234", created_at:"2026-10-03T00:42:00.000Z" },
      { id:2, owner:"partner", provider:"epos", name:"エポスカード", last4:"5678", created_at:"2026-10-12T12:18:00.000Z" }
    ],
    members: [
      { member_key:"me", display_name:"にゃち", email:"me@example.com" },
      { member_key:"partner", display_name:"うー", email:"partner@example.com" }
    ],
    import_batches: [
      { id:2, uploader_user_id:"test-partner", uploader_email:"partner@example.com", uploaded_at:"2026-10-12T12:18:00.000Z", target_month:"2026-10-01", card_id:2, file_name:"epos_202610.pdf", source_format:"pdf", read_count:12, imported_count:10, duplicate_count:1, error_count:1, total_amount:48320, created_at:"2026-10-12T12:18:00.000Z" },
      { id:1, uploader_user_id:"test-me", uploader_email:"me@example.com", uploaded_at:"2026-10-03T00:42:00.000Z", target_month:"2026-10-01", card_id:1, file_name:"rakuten_202610.csv", source_format:"csv", read_count:9, imported_count:8, duplicate_count:1, error_count:0, total_amount:32180, created_at:"2026-10-03T00:42:00.000Z" }
    ]
  };

  var auditLogs = [];
  var ids = { transaction:1000, initial:100, category:100, rule:100, carry:100, settlement:100, repaymentAmount:100, repayment:100, card:10, batch:10 };

  function now() { return new Date().toISOString(); }
  function monthFirst(month) { return month + "-01"; }
  function addMonth(month) {
    var p = month.split("-");
    var d = new Date(Date.UTC(Number(p[0]), Number(p[1]), 1));
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0") + "-01";
  }
  function log(action, table, recordId, beforeData, afterData) {
    auditLogs.unshift({
      id:auditLogs.length+1,
      changed_at:now(),
      actor_email:"test@example.com",
      action:action,
      table_name:table,
      record_id:String(recordId || ""),
      changed_fields:afterData && beforeData ? Object.keys(afterData).filter(function(k){ return JSON.stringify(beforeData[k]) !== JSON.stringify(afterData[k]); }) : [],
      before_data:beforeData || null,
      after_data:afterData || null
    });
  }

  async function getInitialData() { return clone(data); }
  async function getAuditLogs() { return clone(auditLogs); }

  async function updateTransaction(id, tx) {
    var row=data.transactions.find(function(x){return Number(x.id)===Number(id);});
    if(!row) return;
    var before=clone(row);
    Object.assign(row,{date:tx.date,merchant_name:tx.merchant_name,amount:Number(tx.amount),category_name:tx.category_name,scope:tx.scope,payer:tx.payer,memo:tx.memo,status:Number(tx.amount)<0?"refunded":"confirmed"});
    log("UPDATE","transactions",id,before,clone(row));
  }
  async function deleteTransaction(id) {
    var i=data.transactions.findIndex(function(x){return Number(x.id)===Number(id);});
    if(i>=0){var before=data.transactions[i];data.transactions.splice(i,1);log("DELETE","transactions",id,clone(before),null);}
  }
  async function addManualTransaction(tx) {
    var row={id:++ids.transaction,date:tx.date,merchant_name:tx.merchant_name,amount:Number(tx.amount),category_name:tx.category_name,scope:tx.scope,payer:tx.payer,status:Number(tx.amount)<0?"refunded":"confirmed",source:"manual",memo:tx.memo||""};
    data.transactions.push(row); log("INSERT","transactions",row.id,null,clone(row)); return clone(row);
  }
  async function importCsvTransactions(rows, batchMeta) {
    var meta=batchMeta||{};
    var cardMeta=meta.card||{};
    var card=data.cards.find(function(x){
      return x.owner===(cardMeta.owner||"me") &&
        x.provider===cardMeta.provider &&
        x.name===cardMeta.name &&
        String(x.last4||"")===String(cardMeta.last4||"");
    });
    if(!card){
      card={id:++ids.card,owner:cardMeta.owner||"me",provider:cardMeta.provider||"",name:cardMeta.name||"カード",last4:cardMeta.last4||null,created_at:now()};
      data.cards.push(card);
    }
    var batch={
      id:++ids.batch,
      uploader_user_id:"test-me",
      uploader_email:"me@example.com",
      uploaded_at:now(),
      target_month:String(meta.target_month||"2026-10").slice(0,7)+"-01",
      card_id:card.id,
      file_name:meta.file_name||"test.csv",
      source_format:meta.source_format==="pdf"?"pdf":"csv",
      read_count:Number(meta.read_count||rows.length),
      imported_count:rows.length,
      duplicate_count:Number(meta.duplicate_count||0),
      error_count:Number(meta.error_count||0),
      total_amount:Number(meta.total_amount||0),
      created_at:now()
    };
    data.import_batches.unshift(batch);
    var inserted=[];
    for (var i=0;i<rows.length;i++) {
      var r=rows[i];
      var row={id:++ids.transaction,date:r.date,merchant_name:r.merchant_name,merchant_raw:r.merchant_raw||r.merchant_name,amount:Number(r.amount),category_name:r.category_name||null,scope:r.scope||"shared",payer:r.payer||"me",status:r.category_name?(Number(r.amount)<0?"refunded":"confirmed"):"unclassified",source:r.source||"csv",memo:r.memo||"",card_provider:card.provider,card_label:card.name,card_id:card.id,import_batch_id:batch.id,created_at:now()};
      data.transactions.push(row);
      inserted.push(row);
    }
    return {transactions:clone(inserted),batch:Object.assign(clone(batch),{card:clone(card)})};
  }

  async function addInitialExpense(expense) {
    var row={id:++ids.initial,date:expense.date,item_name:expense.item_name,amount:Number(expense.amount),payer:expense.payer,memo:expense.memo||""};
    data.initial_expenses.push(row); log("INSERT","initial_expenses",row.id,null,clone(row)); return clone(row);
  }
  async function updateInitialExpense(id, expense) {
    var row=data.initial_expenses.find(function(x){return Number(x.id)===Number(id);}); if(!row)return;
    var before=clone(row); Object.assign(row,{date:expense.date,item_name:expense.item_name,amount:Number(expense.amount),payer:expense.payer,memo:expense.memo||""});
    log("UPDATE","initial_expenses",id,before,clone(row)); return clone(row);
  }
  async function deleteInitialExpense(id) {
    data.initial_expenses=data.initial_expenses.filter(function(x){return Number(x.id)!==Number(id);});
  }

  async function saveCarryover(category, fromMonth, amount) {
    var row=data.carryovers.find(function(x){return x.category===category && String(x.from_month).slice(0,7)===fromMonth;});
    if(!row){row={id:++ids.carry,from_month:monthFirst(fromMonth),to_month:addMonth(fromMonth),category:category,amount:Number(amount),updated_at:now()};data.carryovers.push(row);}
    else {row.amount=Number(amount);row.updated_at=now();}
    return clone(row);
  }
  async function deleteCarryover(category, fromMonth) {
    data.carryovers=data.carryovers.filter(function(x){return !(x.category===category && String(x.from_month).slice(0,7)===fromMonth);});
  }

  async function saveAppSettings(percent) { data.settings.me_share_percent=Number(percent);data.settings.updated_at=now();return clone(data.settings); }
  async function addCategory(name,icon) { var row={id:++ids.category,name:String(name),icon:String(icon||"").trim()||null};data.categories.push(row);return clone(row); }
  async function updateCategory(id,name,icon) {
    var row=data.categories.find(function(x){return Number(x.id)===Number(id);}); if(row){var old=row.name;row.name=String(name);row.icon=String(icon||"").trim()||null;data.transactions.forEach(function(t){if(t.category_name===old)t.category_name=row.name;});data.merchant_rules.forEach(function(r){if(r.category_name===old)r.category_name=row.name;});} return clone(row);
  }
  async function deleteCategory(id) {
    var row=data.categories.find(function(x){return Number(x.id)===Number(id);});
    if(row){data.categories=data.categories.filter(function(x){return Number(x.id)!==Number(id);});data.transactions.forEach(function(t){if(t.category_name===row.name)t.category_name=null;});}
  }
  async function saveMerchantRule(rule) {
    var row=rule.id?data.merchant_rules.find(function(x){return Number(x.id)===Number(rule.id);}):null;
    if(!row){row={id:++ids.rule};data.merchant_rules.push(row);}
    Object.assign(row,{merchant_name:rule.merchant_name,category_name:rule.mode==="auto"?rule.category_name:null,scope:rule.scope||"shared",mode:rule.mode||"auto"});return clone(row);
  }
  async function deleteMerchantRule(id) { data.merchant_rules=data.merchant_rules.filter(function(x){return Number(x.id)!==Number(id);}); }

  async function saveMonthlyRepaymentAmount(planId, repaymentMonth, amount) {
    var row=data.repayment_amounts.find(function(x){return Number(x.repayment_plan_id)===Number(planId)&&String(x.repayment_month).slice(0,7)===repaymentMonth;});
    if(!row){row={id:++ids.repaymentAmount,repayment_plan_id:Number(planId),repayment_month:monthFirst(repaymentMonth),amount:Number(amount),updated_at:now()};data.repayment_amounts.push(row);}
    else {row.amount=Number(amount);row.updated_at=now();}
    return clone(row);
  }
  async function updateCard(id, fields) {
    var card=data.cards.find(function(x){return Number(x.id)===Number(id);});
    if(!card) throw new Error("not found");
    var name=String((fields&&fields.name)||"").trim();
    var last4=String((fields&&fields.last4)||"").trim();
    if(!name) throw new Error("CARD_NAME_REQUIRED");
    if(last4 && !/^\d{4}$/.test(last4)) throw new Error("CARD_LAST4_INVALID");
    var before=clone(card);
    card.name=name; card.last4=last4||null;
    data.transactions.forEach(function(t){ if(Number(t.card_id)===Number(id)) t.card_label=name; });
    log("UPDATE","cards",id,before,clone(card));
    return clone(card);
  }
  async function deleteCard(id) {
    if(data.import_batches.some(function(b){return Number(b.card_id)===Number(id);})){
      var err=new Error('update or delete on table "cards" violates foreign key constraint');
      err.code="23503"; throw err;
    }
    var i=data.cards.findIndex(function(x){return Number(x.id)===Number(id);});
    if(i>=0){var before=data.cards[i];data.cards.splice(i,1);log("DELETE","cards",id,clone(before),null);}
  }
  async function markSettlementPaid(settlementMonth, amount, planId, repaymentAmount) {
    data.settlements=data.settlements.filter(function(x){return String(x.settlement_month).slice(0,7)!==settlementMonth;});
    data.settlements.push({id:++ids.settlement,settlement_month:monthFirst(settlementMonth),amount:Number(amount),paid_at:now(),created_at:now(),updated_at:now()});
    if(planId && Number(repaymentAmount)>0){
      data.repayments=data.repayments.filter(function(x){return !(Number(x.repayment_plan_id)===Number(planId)&&String(x.repayment_month).slice(0,7)===settlementMonth);});
      data.repayments.push({id:++ids.repayment,repayment_plan_id:Number(planId),repayment_date:monthFirst(settlementMonth),repayment_month:monthFirst(settlementMonth),amount:Number(repaymentAmount),created_at:now()});
    }
  }
  async function undoSettlementPaid(settlementMonth) {
    data.settlements=data.settlements.filter(function(x){return String(x.settlement_month).slice(0,7)!==settlementMonth;});
    data.repayments=data.repayments.filter(function(x){return String(x.repayment_month).slice(0,7)!==settlementMonth;});
  }

  window.kakeiboDb = {
    getInitialData:getInitialData,
    getAuditLogs:getAuditLogs,
    updateTransaction:updateTransaction,
    deleteTransaction:deleteTransaction,
    addManualTransaction:addManualTransaction,
    importCsvTransactions:importCsvTransactions,
    addInitialExpense:addInitialExpense,
    updateInitialExpense:updateInitialExpense,
    deleteInitialExpense:deleteInitialExpense,
    saveCarryover:saveCarryover,
    deleteCarryover:deleteCarryover,
    saveAppSettings:saveAppSettings,
    addCategory:addCategory,
    updateCategory:updateCategory,
    deleteCategory:deleteCategory,
    saveMerchantRule:saveMerchantRule,
    deleteMerchantRule:deleteMerchantRule,
    saveMonthlyRepaymentAmount:saveMonthlyRepaymentAmount,
    updateCard:updateCard,
    deleteCard:deleteCard,
    markSettlementPaid:markSettlementPaid,
    undoSettlementPaid:undoSettlementPaid
  };
})();