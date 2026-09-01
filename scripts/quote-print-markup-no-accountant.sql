-- ---------------------------------------------------------------------------
-- На поліграфії головбух не затверджує відхилення від накрутки — НІКОЛИ.
--
-- НАВІЩО. Попередні два кроки лишили лазівку: якщо
-- company_pricing_rates.print_markup_approver_user_id порожнє, правило падало
-- на загальне (owner / СЕО / головбух). Тобто досить було стерти одне
-- налаштування — і головбух знову міг би підписати поліграфію.
--
-- Артем 01.09.2026 сформулював вимогу без винятків: «на поліграфії главбух не
-- повинен затверджувати відхилення від накрутки». Правило з умовою «якщо
-- налаштування заповнене» такій вимозі не відповідає — воно відповідає їй лише
-- поки хтось не змінив дані.
--
-- ЩО ЗАМІСТЬ ПАДІННЯ НА ЗАГАЛЬНЕ ПРАВИЛО. Без призначеного погоджувача
-- поліграфію підписує будь-який СЕО. Глухого кута це не створює: СЕО в компанії
-- двоє, і саме їх Олена назвала запасним варіантом («будуть чекати або СЕО
-- номер 2»).
--
-- Власника сюди теж не повертаємо: на поліграфії його не називав ніхто, і
-- «щоб хтось міг» — не підстава роздавати право на ціну.
--
-- Дзеркало в застосунку: canApproveQuoteMarkup (src/lib/permissions.ts).
--
-- Застосування: npm run db:apply scripts/quote-print-markup-no-accountant.sql
-- ---------------------------------------------------------------------------

create or replace function tosho.is_quote_markup_approver(_user_id uuid, _quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
  with target as (
    select
      lower(coalesce(q.quote_type::text, '')) = 'print' as is_print,
      (
        select r.print_markup_approver_user_id
          from tosho.company_pricing_rates r
          join tosho.memberships m on m.workspace_id = r.workspace_id
         where m.user_id = _user_id
         limit 1
      ) as print_approver
      from tosho.quotes q
     where q.id = _quote_id
  )
  select case
    -- ПОЛІГРАФІЯ: призначений погоджувач або будь-який СЕО. Головбух і власник
    -- сюди не входять — ні коли налаштування заповнене, ні коли порожнє.
    when (select is_print from target)
      then _user_id = (select print_approver from target)
        or exists (
          select 1
            from tosho.memberships m
           where m.user_id = _user_id
             and lower(coalesce(m.job_role::text, '')) = 'seo'
        )
    -- МЕРЧ І «ІНШЕ»: правило від 30.08.2026 без змін.
    else exists (
      select 1
        from tosho.memberships m
       where m.user_id = _user_id
         and (
           lower(coalesce(m.role::text, '')) = 'owner'
           or lower(coalesce(m.job_role::text, '')) in ('seo', 'chief_accountant')
         )
    )
  end;
$$;

revoke all on function tosho.is_quote_markup_approver(uuid, uuid) from public;
grant execute on function tosho.is_quote_markup_approver(uuid, uuid) to authenticated;

-- Перевірка після застосування (підставте свої ідентифікатори):
--   select tosho.is_quote_markup_approver(<головбух>, <поліграфічний прорахунок>); -- f
--   select tosho.is_quote_markup_approver(<головбух>, <мерчевий прорахунок>);      -- t
