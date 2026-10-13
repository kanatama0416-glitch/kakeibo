-- オフラインで追加した支出の二重登録を防ぐための「送信ID」。
-- 端末で発行した UUID を送り、同じ送信IDの明細は1件しか登録できないようにする。
-- 送信は成功したが応答が届かず再送した場合も、2件目は一意制約で弾かれる（画面側は既存の1件を成功として扱う）。
-- 既存の明細・カード取込・手入力（オンライン）は null のままで影響しない。

alter table public.transactions
  add column if not exists client_request_id uuid;

-- null は何件あっても重複扱いにならない（通常の一意制約の挙動）。
alter table public.transactions
  drop constraint if exists transactions_client_request_id_key;
alter table public.transactions
  add constraint transactions_client_request_id_key unique (client_request_id);

comment on column public.transactions.client_request_id is
  '端末で発行した送信ID（オフライン追加の再送で二重登録しないため）。null は通常の登録。';
