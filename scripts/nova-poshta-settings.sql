-- Nova Poshta — Phase 2: налаштування відправника (рівень команди).
-- Дефолти для створення ТТН: хто відправник, звідки шлемо, параметри вантажу.
-- Секрет NOVA_POSHTA_API_KEY тут НЕ зберігається — він лише в env Netlify-функції.
-- Застосовувати на prod вручну (DDL). Патерн — як tosho.vchasno_documents (team-scoped).

create table if not exists tosho.nova_poshta_settings (
  team_id                uuid primary key references public.teams(id) on delete cascade,
  -- Відправник (Counterparty Sender + його контактна особа)
  sender_ref             text,
  sender_name            text,
  sender_contact_ref     text,
  sender_contact_name    text,
  sender_phone           text,
  -- Точка відправлення (місто + відділення)
  sender_city_ref        text,
  sender_city_name       text,
  sender_warehouse_ref   text,
  sender_warehouse_name  text,
  -- Дефолти відправлення
  default_payer          text    not null default 'Recipient',           -- Sender | Recipient | ThirdPerson
  default_payment_method text    not null default 'Cash',                -- Cash | NonCash
  default_cargo_type     text    not null default 'Parcel',              -- Cargo | Parcel | Documents | Pallet | TiresWheels
  default_service_type   text    not null default 'WarehouseWarehouse',  -- WarehouseWarehouse | WarehouseDoors | DoorsWarehouse | DoorsDoors
  default_weight         numeric,                                        -- кг
  default_seats          integer not null default 1,
  default_description    text,
  created_at             timestamptz not null default timezone('utc', now()),
  updated_at             timestamptz not null default timezone('utc', now())
);

-- updated_at touch trigger
create or replace function tosho.set_nova_poshta_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists nova_poshta_settings_set_updated_at on tosho.nova_poshta_settings;
create trigger nova_poshta_settings_set_updated_at
before update on tosho.nova_poshta_settings
for each row execute function tosho.set_nova_poshta_settings_updated_at();

-- Гранти + RLS (учасник команди читає/редагує рядок своєї команди).
grant usage on schema tosho to authenticated;
grant select, insert, update on tosho.nova_poshta_settings to authenticated;

alter table tosho.nova_poshta_settings enable row level security;

drop policy if exists "nps_select_team" on tosho.nova_poshta_settings;
create policy "nps_select_team" on tosho.nova_poshta_settings
  for select to authenticated using (public.is_team_member(team_id));

drop policy if exists "nps_insert_team" on tosho.nova_poshta_settings;
create policy "nps_insert_team" on tosho.nova_poshta_settings
  for insert to authenticated with check (public.is_team_member(team_id));

drop policy if exists "nps_update_team" on tosho.nova_poshta_settings;
create policy "nps_update_team" on tosho.nova_poshta_settings
  for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

notify pgrst, 'reload schema';
