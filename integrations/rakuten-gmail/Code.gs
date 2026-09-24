/**
 * 楽天カード確定メール → Supabase kakeibo 自動取込
 *
 * 初回設定:
 * 1. script.google.com でスタンドアロンスクリプトを作る
 * 2. このファイルを Code.gs に貼り付ける
 * 3. Project Settings > Script Properties に
 *    RAKUTEN_IMPORT_TOKEN を登録する
 * 4. testLatestRakutenMail() を実行
 * 5. syncRakutenCardEmails() を実行
 * 6. setupHourlyTrigger() を1回実行
 *
 * 注意:
 * - 速報版は店舗名がないため取り込みません。
 * - 確定版1通に複数明細が含まれていても分解して送ります。
 * - Supabase側で source_message_id + source_item_index の重複を防止します。
 */

const SUPABASE_URL = 'https://vcokmkljwxuyiytiqtlc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ww13dYot4RnKABa3HKUDkQ_50tLWmqa';
const IMPORT_ENDPOINT = '/functions/v1/import-rakuten-gmail';

const RAKUTEN_SENDER = 'info@mail.rakuten-card.co.jp';
const RAKUTEN_CONFIRMED_SUBJECT = 'カード利用のお知らせ(本人ご利用分)';
const PROCESSED_LABEL = '家計簿/楽天カード取込済';

function syncRakutenCardEmails() {
  const token = PropertiesService.getScriptProperties().getProperty('RAKUTEN_IMPORT_TOKEN');
  if (!token) {
    throw new Error('Script Properties に RAKUTEN_IMPORT_TOKEN を設定してください。');
  }

  const query = [
    'from:' + RAKUTEN_SENDER,
    'subject:"' + RAKUTEN_CONFIRMED_SUBJECT + '"',
    '-subject:"【速報版】"',
    'newer_than:30d',
    '-in:trash',
    '-in:spam'
  ].join(' ');

  const threads = GmailApp.search(query, 0, 50);
  const items = [];
  const processedThreads = [];

  threads.forEach(thread => {
    let foundConfirmedMessage = false;

    thread.getMessages().forEach(message => {
      if (message.getFrom().indexOf(RAKUTEN_SENDER) === -1) return;
      if (message.getSubject() !== RAKUTEN_CONFIRMED_SUBJECT) return;

      const parsed = parseRakutenConfirmedMail_(
        message.getPlainBody(),
        message.getId(),
        message.getDate()
      );

      if (parsed.length > 0) {
        items.push.apply(items, parsed);
        foundConfirmedMessage = true;
      }
    });

    if (foundConfirmedMessage) processedThreads.push(thread);
  });

  if (items.length === 0) {
    console.log('楽天カード確定明細はありません。');
    return { inserted: 0, parsed: 0 };
  }

  const response = UrlFetchApp.fetch(SUPABASE_URL + IMPORT_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'x-import-token': token
    },
    payload: JSON.stringify({
      items: items
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error('Supabase取込失敗: HTTP ' + status + ' / ' + body);
  }

  const result = body ? JSON.parse(body) : { inserted: 0 };

  // 成功後のみラベルを付与。既読化・アーカイブはしません。
  const label =
    GmailApp.getUserLabelByName(PROCESSED_LABEL) ||
    GmailApp.createLabel(PROCESSED_LABEL);

  processedThreads.forEach(thread => thread.addLabel(label));

  const summary = {
    parsed: result.parsed || items.length,
    inserted: result.inserted || 0
  };

  console.log(JSON.stringify(summary));
  return summary;
}

function parseRakutenConfirmedMail_(body, messageId, receivedDate) {
  if (!body) return [];

  const start = body.indexOf('ご利用金額');
  const end = body.indexOf('合計', start + 1);

  if (start === -1 || end === -1 || end <= start) return [];

  const block = body.slice(start, end);
  const cardMatch = body.match(/([^\r\n]+カード（[^）]+）)ご利用内容/);
  const cardLabel = cardMatch ? cardMatch[1].trim() : '楽天カード';

  const re = /(\d{4}\/\d{2}\/\d{2})[ \t]+([^\r\n]+?)[ \t]+([\d,]+)[ \t]*円/g;
  const out = [];
  let match;
  let index = 0;

  while ((match = re.exec(block)) !== null) {
    const merchant = match[2].trim();
    const amount = Number(match[3].replace(/,/g, ''));

    if (!merchant || !Number.isFinite(amount)) continue;

    out.push({
      transaction_date: match[1].replace(/\//g, '-'),
      merchant_name: merchant,
      amount: amount,
      source_message_id: messageId,
      source_item_index: index,
      source_received_at: receivedDate.toISOString(),
      card_label: cardLabel
    });

    index += 1;
  }

  return out;
}

function setupHourlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncRakutenCardEmails')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncRakutenCardEmails')
    .timeBased()
    .everyHours(1)
    .create();

  console.log('1時間ごとの楽天カード取込トリガーを作成しました。');
}

function removeRakutenImportTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncRakutenCardEmails')
    .forEach(t => ScriptApp.deleteTrigger(t));

  console.log('楽天カード取込トリガーを削除しました。');
}

function testLatestRakutenMail() {
  const query = [
    'from:' + RAKUTEN_SENDER,
    'subject:"' + RAKUTEN_CONFIRMED_SUBJECT + '"',
    '-subject:"【速報版】"'
  ].join(' ');

  const threads = GmailApp.search(query, 0, 1);
  if (!threads.length) throw new Error('楽天カード確定メールが見つかりません。');

  const messages = threads[0].getMessages()
    .filter(m => m.getFrom().indexOf(RAKUTEN_SENDER) !== -1)
    .filter(m => m.getSubject() === RAKUTEN_CONFIRMED_SUBJECT);

  if (!messages.length) throw new Error('確定版メールが見つかりません。');

  const m = messages[messages.length - 1];
  const parsed = parseRakutenConfirmedMail_(m.getPlainBody(), m.getId(), m.getDate());
  console.log(JSON.stringify(parsed, null, 2));
  return parsed;
}
