-- Логістика: адреси доставки (відділення/поштомати НП, адресна доставка) для
-- замовників і лідів. Repeatable rows у jsonb — той самий патерн, що contacts
-- та legal_entities. НП API-refs (np_city_ref/np_warehouse_ref) живуть усередині
-- обʼєктів масиву — колонок під них не треба.
-- Safe to run multiple times.

alter table if exists tosho.customers
  add column if not exists delivery_points jsonb not null default '[]'::jsonb;

alter table if exists tosho.leads
  add column if not exists delivery_points jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
