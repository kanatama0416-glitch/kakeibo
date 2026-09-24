(function () {
  var config = window.KAKEIBO_CONFIG || {};
  var canConnect = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  var client = canConnect ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

  var mock = {
    categories: [
      { id: 1, name: "食費", icon: "🛒" },
      { id: 2, name: "日用品", icon: "🧴" },
      { id: 3, name: "光熱費", icon: "💡" },
      { id: 4, name: "外食", icon: "☕" },
      { id: 5, name: "家具・家電", icon: "🪑" },
      { id: 6, name: "その他", icon: "•" }
    ],
    merchant_rules: [
      { id: 1, merchant_name: "アルビス", category_name: "食費", scope: "shared", mode: "auto" },
      { id: 2, merchant_name: "クスリのアオキ", category_name: "日用品", scope: "shared", mode: "auto" },
      { id: 3, merchant_name: "北陸電力", category_name: "光熱費", scope: "shared", mode: "auto" },
      { id: 4, merchant_name: "Amazon", category_name: null, scope: "shared", mode: "confirm" }
    ],
    transactions: [
      { id: 101, date: "2026-09-23", merchant_name: "アルビス 小松店", amount: 3842, category_name: "食費", scope: "shared", payer: "me", status: "confirmed" },
      { id: 102, date: "2026-09-21", merchant_name: "北陸電力", amount: 8920, category_name: "光熱費", scope: "shared", payer: "me", status: "confirmed" },
      { id: 103, date: "2026-09-20", merchant_name: "スターバックス", amount: 720, category_name: "外食", scope: "mine", payer: "me", status: "confirmed" },
      { id: 104, date: "2026-09-20", merchant_name: "AMZN MKTP JP", amount: 2480, category_name: null, scope: null, payer: "partner", status: "unclassified" },
      { id: 105, date: "2026-09-18", merchant_name: "KOMATSU STATION SHOP", amount: 1260, category_name: null, scope: null, payer: "me", status: "unclassified" },
      { id: 106, date: "2026-09-17", merchant_name: "クスリのアオキ", amount: 4680, category_name: "日用品", scope: "shared", payer: "partner", status: "confirmed" },
      { id: 107, date: "2026-09-15", merchant_name: "大阪屋ショップ", amount: 6150, category_name: "食費", scope: "shared", payer: "me", status: "confirmed" }
    ],
    loans: [
      { id: 201, date: "2026-09-18", description: "映画チケット", amount: 3800, lender: "me", borrower: "partner", status: "open" },
      { id: 202, date: "2026-09-12", description: "タクシー代", amount: 1600, lender: "partner", borrower: "me", status: "open" },
      { id: 203, date: "2026-09-10", description: "イベントチケット", amount: 4300, lender: "me", borrower: "partner", status: "open" }
    ],
    repayment_plan: { id: 301, title: "同棲初期費用", original_amount: 300000, remaining_amount: 180000, monthly_amount: 20000, lender: "me", borrower: "partner" }
  };

  async function table(name, select) {
    var query = client.from(name).select(select || "*");
    var result = await query;
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function getInitialData() {
    if (!client) return JSON.parse(JSON.stringify(mock));
    try {
      var results = await Promise.all([
        table("categories"),
        table("merchant_rules_view"),
        table("transactions_view"),
        table("loans"),
        table("repayment_plans")
      ]);
      return {
        categories: results[0],
        merchant_rules: results[1],
        transactions: results[2],
        loans: results[3],
        repayment_plan: results[4][0] || null
      };
    } catch (error) {
      console.error("Supabase load failed; falling back to mock data.", error);
      if (config.useMockDataWhenDisconnected) return JSON.parse(JSON.stringify(mock));
      throw error;
    }
  }

  async function classifyTransaction(id, categoryName, scope, rememberMerchant) {
    if (!client) return { mock: true };
    var categoryResult = await client.from("categories").select("id").eq("name", categoryName).limit(1);
    if (categoryResult.error) throw categoryResult.error;
    var categoryId = categoryResult.data[0] ? categoryResult.data[0].id : null;

    var updateResult = await client.from("transactions")
      .update({ category_id: categoryId, scope: scope, status: "confirmed" })
      .eq("id", id);
    if (updateResult.error) throw updateResult.error;

    if (rememberMerchant) {
      var txResult = await client.from("transactions").select("merchant_name").eq("id", id).limit(1);
      if (txResult.error) throw txResult.error;
      if (txResult.data[0]) {
        var ruleResult = await client.from("merchant_rules").insert({
          merchant_name: txResult.data[0].merchant_name,
          category_id: categoryId,
          scope: scope,
          mode: "auto"
        });
        if (ruleResult.error) console.warn(ruleResult.error);
      }
    }
    return { mock: false };
  }

  async function updateRepaymentAmount(planId, amount) {
    if (!client) return { mock: true };
    var result = await client.from("repayment_plans").update({ monthly_amount: amount }).eq("id", planId);
    if (result.error) throw result.error;
    return { mock: false };
  }

  window.kakeiboDb = {
    connected: Boolean(client),
    getInitialData: getInitialData,
    classifyTransaction: classifyTransaction,
    updateRepaymentAmount: updateRepaymentAmount
  };
})();