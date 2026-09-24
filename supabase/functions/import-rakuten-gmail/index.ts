import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const EXPECTED_TOKEN_SHA256 =
  "12778b424d8dc4041470e46c046486bf4aebf7158a8e6a94a5f4e1ba18604cc9";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const token = req.headers.get("x-import-token") ?? "";
  if (!token || (await sha256Hex(token)) !== EXPECTED_TOKEN_SHA256) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) return json({ parsed: 0, inserted: 0 });
  if (items.length > 200) return json({ error: "too_many_items" }, 400);

  const rows = items
    .filter(
      (item: any) =>
        /^\d{4}-\d{2}-\d{2}$/.test(String(item.transaction_date ?? "")) &&
        String(item.merchant_name ?? "").trim().length > 0 &&
        Number.isInteger(Number(item.amount)) &&
        Number(item.amount) >= 0 &&
        String(item.source_message_id ?? "").trim().length > 0,
    )
    .map((item: any) => ({
      transaction_date: item.transaction_date,
      merchant_name: String(item.merchant_name).trim(),
      merchant_raw: String(item.merchant_name).trim(),
      amount: Number(item.amount),
      scope: null,
      payer: "me",
      status: "unclassified",
      source: "rakuten_email",
      source_message_id: String(item.source_message_id),
      source_item_index: Number(item.source_item_index ?? 0),
      source_received_at: item.source_received_at ?? null,
      card_provider: "rakuten",
      card_label: item.card_label ?? "楽天カード",
      is_demo: false,
    }));

  if (rows.length === 0) return json({ parsed: 0, inserted: 0 });

  const secretKeys = JSON.parse(
    Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}",
  );
  const secretKey = secretKeys["default"];
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!secretKey || !supabaseUrl) {
    return json({ error: "server_not_configured" }, 500);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("transactions")
    .upsert(rows, {
      onConflict: "source_message_id,source_item_index",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    console.error(error);
    return json({ error: "database_error", detail: error.message }, 500);
  }

  return json({
    parsed: rows.length,
    inserted: data?.length ?? 0,
  });
});
