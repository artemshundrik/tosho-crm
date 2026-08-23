-- REQ-105 — закрити несанкціонований доступ до 11 базових таблиць схеми tosho.
--
-- СТАН ДО ПРАВКИ (заміряно на проді 23.08.2026):
--   11 таблиць мають RLS вимкнено і GRANT SELECT для ролі anon. Anon-ключ лежить
--   у фронтенд-бандлі, тобто це читання взагалі без логіну, звичайним REST-запитом:
--     catalog_models 235 · catalog_methods 209 · catalog_model_methods 429
--     catalog_kinds 91 · catalog_types 29 · catalog_print_positions 8
--     catalog_price_tiers 0 (структура є, даних поки немає)
--     name_declensions 4 · quote_counters 1 · _healthcheck 1
--     _contractors_phone_backup 1 (назва контрагента + телефон)
--   Відомо з 11.07.2026: scripts/fix-anon-view-leak.sql, розділ «OPTIONAL tidy».
--   Тоді закрили лише представлення, а базові таблиці лишили до рішення
--   «каталог публічний чи ні». Рішення: каталог внутрішній.
--
-- ЩО РОБИТЬ СКРИПТ:
--   1) знімає SELECT з anon на всіх 11 таблицях;
--   2) вмикає RLS і додає політики для authenticated там, куди справді ходить фронт;
--   3) службові таблиці лишає тільки service_role — до них ходять лише
--      SECURITY DEFINER-функції та Netlify-функції з сервісним ключем.
--
-- ЧОМУ ЦЕ НІЧОГО НЕ ЛАМАЄ (перевірено, а не припущено):
--   - анонімних шляхів читання в застосунку немає: публічні маршрути це /login,
--     /reset-password, /update-password, /enter, /invite — жоден не торкається каталогу;
--   - фронт читає каталог під JWT залогіненого користувача → політики
--     public.is_team_member(team_id) його пропускають (одна команда, 21 учасник,
--     жодного team_id is null, жодного осиротілого дочірнього рядка);
--   - netlify/functions/tosho-ai.ts читає каталог через adminClient (service_role),
--     а сервісна роль обходить RLS;
--   - netlify/functions/decline-name.ts працює з name_declensions теж лише adminClient-ом;
--   - tosho.next_quote_number() і public.next_quote_number() — SECURITY DEFINER,
--     тож нумерація прорахунків не залежить від грантів для authenticated;
--   - tosho.method_directory_sync_name() — SECURITY INVOKER тригер, який каскадом
--     оновлює catalog_methods; він працює в межах тієї ж команди, тож політика
--     catalog_methods_update його пропускає;
--   - supabaseHealthCheck() у src/lib/supabaseClient.ts не має жодного виклику
--     (мертвий помічник), але політику читання для authenticated лишаємо, щоб він
--     працював, якщо колись знадобиться.
--
-- ЗВОРОТНИЙ ХІД — у кінці файлу.

\set ON_ERROR_STOP on

begin;

-- 1. anon більше не читає нічого з цих таблиць --------------------------------
revoke select on
  tosho.catalog_types,
  tosho.catalog_kinds,
  tosho.catalog_models,
  tosho.catalog_methods,
  tosho.catalog_model_methods,
  tosho.catalog_price_tiers,
  tosho.catalog_print_positions,
  tosho.name_declensions,
  tosho.quote_counters,
  tosho._healthcheck,
  tosho._contractors_phone_backup
from anon;

-- 2. Службові таблиці: лишається тільки service_role ---------------------------
-- name_declensions — кеш відмінювання імен, до нього ходить лише decline-name.ts.
-- quote_counters — лічильник номерів, його рухає SECURITY DEFINER-функція.
-- _contractors_phone_backup — знімок від 07.08.2026 перед видаленням старої колонки
-- телефону (scripts/contractor-drop-legacy-phone.sql). Читати його з застосунку
-- нікому не треба; чи він узагалі потрібен — окреме рішення, тут його не чіпаємо.
revoke all on tosho.name_declensions           from authenticated;
revoke all on tosho.quote_counters             from authenticated;
revoke all on tosho._contractors_phone_backup  from authenticated;

-- 3. Довідники з власним team_id ------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['catalog_types', 'catalog_kinds', 'catalog_models', 'catalog_methods'] loop
    execute format('alter table tosho.%I enable row level security', t);

    execute format('drop policy if exists %I on tosho.%I', t || '_select', t);
    execute format(
      'create policy %I on tosho.%I for select to authenticated using (public.is_team_member(team_id))',
      t || '_select', t);

    execute format('drop policy if exists %I on tosho.%I', t || '_insert', t);
    execute format(
      'create policy %I on tosho.%I for insert to authenticated with check (public.is_team_member(team_id))',
      t || '_insert', t);

    execute format('drop policy if exists %I on tosho.%I', t || '_update', t);
    execute format(
      'create policy %I on tosho.%I for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id))',
      t || '_update', t);

    execute format('drop policy if exists %I on tosho.%I', t || '_delete', t);
    execute format(
      'create policy %I on tosho.%I for delete to authenticated using (public.is_team_member(team_id))',
      t || '_delete', t);
  end loop;
end $$;

-- 4. Дочірні таблиці без team_id — межа команди успадковується від батька -------

-- catalog_model_methods (model_id, method_id) → catalog_models.team_id
alter table tosho.catalog_model_methods enable row level security;
drop policy if exists catalog_model_methods_select on tosho.catalog_model_methods;
create policy catalog_model_methods_select on tosho.catalog_model_methods
  for select to authenticated
  using (exists (select 1 from tosho.catalog_models m
                  where m.id = catalog_model_methods.model_id
                    and public.is_team_member(m.team_id)));
drop policy if exists catalog_model_methods_insert on tosho.catalog_model_methods;
create policy catalog_model_methods_insert on tosho.catalog_model_methods
  for insert to authenticated
  with check (exists (select 1 from tosho.catalog_models m
                       where m.id = catalog_model_methods.model_id
                         and public.is_team_member(m.team_id)));
drop policy if exists catalog_model_methods_update on tosho.catalog_model_methods;
create policy catalog_model_methods_update on tosho.catalog_model_methods
  for update to authenticated
  using (exists (select 1 from tosho.catalog_models m
                  where m.id = catalog_model_methods.model_id
                    and public.is_team_member(m.team_id)))
  with check (exists (select 1 from tosho.catalog_models m
                       where m.id = catalog_model_methods.model_id
                         and public.is_team_member(m.team_id)));
drop policy if exists catalog_model_methods_delete on tosho.catalog_model_methods;
create policy catalog_model_methods_delete on tosho.catalog_model_methods
  for delete to authenticated
  using (exists (select 1 from tosho.catalog_models m
                  where m.id = catalog_model_methods.model_id
                    and public.is_team_member(m.team_id)));

-- catalog_price_tiers (model_id, min_qty, max_qty, price) → catalog_models.team_id
alter table tosho.catalog_price_tiers enable row level security;
drop policy if exists catalog_price_tiers_select on tosho.catalog_price_tiers;
create policy catalog_price_tiers_select on tosho.catalog_price_tiers
  for select to authenticated
  using (exists (select 1 from tosho.catalog_models m
                  where m.id = catalog_price_tiers.model_id
                    and public.is_team_member(m.team_id)));
drop policy if exists catalog_price_tiers_insert on tosho.catalog_price_tiers;
create policy catalog_price_tiers_insert on tosho.catalog_price_tiers
  for insert to authenticated
  with check (exists (select 1 from tosho.catalog_models m
                       where m.id = catalog_price_tiers.model_id
                         and public.is_team_member(m.team_id)));
drop policy if exists catalog_price_tiers_update on tosho.catalog_price_tiers;
create policy catalog_price_tiers_update on tosho.catalog_price_tiers
  for update to authenticated
  using (exists (select 1 from tosho.catalog_models m
                  where m.id = catalog_price_tiers.model_id
                    and public.is_team_member(m.team_id)))
  with check (exists (select 1 from tosho.catalog_models m
                       where m.id = catalog_price_tiers.model_id
                         and public.is_team_member(m.team_id)));
drop policy if exists catalog_price_tiers_delete on tosho.catalog_price_tiers;
create policy catalog_price_tiers_delete on tosho.catalog_price_tiers
  for delete to authenticated
  using (exists (select 1 from tosho.catalog_models m
                  where m.id = catalog_price_tiers.model_id
                    and public.is_team_member(m.team_id)));

-- catalog_print_positions (kind_id, label, sort_order) → catalog_kinds.team_id
alter table tosho.catalog_print_positions enable row level security;
drop policy if exists catalog_print_positions_select on tosho.catalog_print_positions;
create policy catalog_print_positions_select on tosho.catalog_print_positions
  for select to authenticated
  using (exists (select 1 from tosho.catalog_kinds k
                  where k.id = catalog_print_positions.kind_id
                    and public.is_team_member(k.team_id)));
drop policy if exists catalog_print_positions_insert on tosho.catalog_print_positions;
create policy catalog_print_positions_insert on tosho.catalog_print_positions
  for insert to authenticated
  with check (exists (select 1 from tosho.catalog_kinds k
                       where k.id = catalog_print_positions.kind_id
                         and public.is_team_member(k.team_id)));
drop policy if exists catalog_print_positions_update on tosho.catalog_print_positions;
create policy catalog_print_positions_update on tosho.catalog_print_positions
  for update to authenticated
  using (exists (select 1 from tosho.catalog_kinds k
                  where k.id = catalog_print_positions.kind_id
                    and public.is_team_member(k.team_id)))
  with check (exists (select 1 from tosho.catalog_kinds k
                       where k.id = catalog_print_positions.kind_id
                         and public.is_team_member(k.team_id)));
drop policy if exists catalog_print_positions_delete on tosho.catalog_print_positions;
create policy catalog_print_positions_delete on tosho.catalog_print_positions
  for delete to authenticated
  using (exists (select 1 from tosho.catalog_kinds k
                  where k.id = catalog_print_positions.kind_id
                    and public.is_team_member(k.team_id)));

-- 5. Технічна таблиця живучості -------------------------------------------------
alter table tosho._healthcheck enable row level security;
drop policy if exists healthcheck_select on tosho._healthcheck;
create policy healthcheck_select on tosho._healthcheck
  for select to authenticated using (true);

-- 6. Службові таблиці: RLS без політик = закрито для всіх, крім service_role ----
alter table tosho.name_declensions          enable row level security;
alter table tosho.quote_counters            enable row level security;
alter table tosho._contractors_phone_backup enable row level security;

-- 7. ПЕРЕВІРКА В ТІЙ САМІЙ ТРАНЗАКЦІЇ ------------------------------------------

-- 7.1 anon не має бачити жодної з 11 таблиць.
set local role anon;
do $$
declare t text; n int;
begin
  foreach t in array array[
    'catalog_types', 'catalog_kinds', 'catalog_models', 'catalog_methods',
    'catalog_model_methods', 'catalog_price_tiers', 'catalog_print_positions',
    'name_declensions', 'quote_counters', '_healthcheck', '_contractors_phone_backup'
  ] loop
    begin
      execute format('select count(*) from tosho.%I', t) into n;
      raise exception 'ВСЕ ЩЕ ТЕЧЕ: tosho.% віддала anon % рядків', t, n;
    exception when insufficient_privilege then
      raise notice 'ОК: tosho.% закрито для anon', t;
    end;
  end loop;
end $$;
reset role;

-- 7.2 Залогінений учасник команди має бачити каталог так само, як бачив.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select tm.user_id from public.team_members tm
             where not tosho.is_user_blocked(tm.user_id) limit 1),
    'role', 'authenticated')::text,
  true) as _claims;

set local role authenticated;
do $$
declare
  expected jsonb := jsonb_build_object(
    'catalog_types', 29, 'catalog_kinds', 91, 'catalog_models', 235,
    'catalog_methods', 209, 'catalog_model_methods', 429,
    'catalog_print_positions', 8, 'catalog_price_tiers', 0);
  t text;
  n int;
  want int;
begin
  for t, want in select key, value::int from jsonb_each_text(expected) loop
    execute format('select count(*) from tosho.%I', t) into n;
    if n <> want then
      raise exception 'ЗЛАМАНО: учасник команди бачить у tosho.% % рядків замість %', t, n, want;
    end if;
    raise notice 'ОК: tosho.% — учасник бачить % рядків', t, n;
  end loop;
end $$;
reset role;

commit;

-- 8. PostgREST тримає гранти в кеші схеми — просимо перечитати.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ЗВОРОТНИЙ ХІД (якщо раптом щось таки ходило анонімно):
--
-- alter table tosho.catalog_types             disable row level security;
-- alter table tosho.catalog_kinds             disable row level security;
-- alter table tosho.catalog_models            disable row level security;
-- alter table tosho.catalog_methods           disable row level security;
-- alter table tosho.catalog_model_methods     disable row level security;
-- alter table tosho.catalog_price_tiers       disable row level security;
-- alter table tosho.catalog_print_positions   disable row level security;
-- alter table tosho.name_declensions          disable row level security;
-- alter table tosho.quote_counters            disable row level security;
-- alter table tosho._healthcheck              disable row level security;
-- alter table tosho._contractors_phone_backup disable row level security;
-- grant select on tosho.catalog_types, tosho.catalog_kinds, tosho.catalog_models,
--   tosho.catalog_methods, tosho.catalog_model_methods, tosho.catalog_price_tiers,
--   tosho.catalog_print_positions, tosho.name_declensions, tosho.quote_counters,
--   tosho._healthcheck, tosho._contractors_phone_backup to anon;
-- grant select, insert, update, delete on tosho.name_declensions,
--   tosho.quote_counters, tosho._contractors_phone_backup to authenticated;
-- notify pgrst, 'reload schema';
