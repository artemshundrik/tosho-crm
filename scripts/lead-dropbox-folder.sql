-- =====================================================================
-- lead-dropbox-folder.sql
-- Теки Dropbox для лідів — ті самі поля, що й у замовників.
--
-- Навіщо: після доливки з 14 тек, яким не знайшлося замовника, дев'ять
-- виявились ЛІДАМИ — роботу робили для потенційного клієнта до угоди
-- (life biochem, Уманьпиво, УАЛ, Датафорест, Visionarium, Invigo,
-- alfa smart agro, землероб, Агро Панцир). Це не виняток, а нормальний
-- сценарій, тож лід має вміти тримати свою теку так само, як замовник.
--
-- Коли лід стає замовником, шлях переноситься на картку замовника — теку
-- при цьому нікуди не рухаємо, бо шлях і є джерелом правди.
--
-- Ідемпотентно: можна виконувати повторно.
-- =====================================================================

alter table tosho.leads
  add column if not exists dropbox_client_path text,
  add column if not exists dropbox_brand_path text,
  add column if not exists dropbox_shared_url text,
  add column if not exists dropbox_brand_shared_url text;

comment on column tosho.leads.dropbox_client_path is
  'Шлях до теки ліда в Dropbox. ДЖЕРЕЛО ПРАВДИ: теку шукаємо за ним, а не будуємо з назви — інакше перейменування ліда створює другу теку.';
comment on column tosho.leads.dropbox_brand_shared_url is
  'Shared-посилання на теку «Бренд» ліда — матеріали від нього.';
