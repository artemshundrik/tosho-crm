-- ---------------------------------------------------------------------------
-- Другий СЕО — запасний погоджувач поліграфії (REQ-182).
--
-- НАВІЩО. Попередній крок (scripts/quote-print-markup-approver.sql) звузив
-- затвердження поліграфії до однієї людини — Олени. Артем спитав у неї, що
-- буде за її відсутності, і вона відповіла: «будуть чекати або СЕО номер 2».
--
-- Тобто правило не «тільки вона й крапка», а «адресовано їй, підписати може ще
-- другий СЕО». Різниця не косметична: без запасного двотижнева відпустка
-- зупиняла б кожен поліграфічний прорахунок нижче дна, і єдиним виходом було б
-- лізти в налаштування руками.
--
-- ЩО ЛИШАЄТЬСЯ ІМЕННИМ. Адресат запиту: сповіщення йде тільки призначеному
-- погоджувачу, і в текстах картки стоїть його ім'я. Право підписати — ширше за
-- адресата, і це нормально: перше про те, кого чекають, друге про те, хто може
-- розблокувати.
--
-- КОГО СЮДИ НЕ ПОВЕРНУЛИ. Головного бухгалтера й власника: у поліграфії їх не
-- називав ні Артем, ні Олена. «Щоб хтось міг» — не підстава роздавати право на
-- ціну.
--
-- Дзеркало в застосунку: canApproveQuoteMarkup (src/lib/permissions.ts).
--
-- Застосування: npm run db:apply scripts/quote-print-markup-approver-backup.sql
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
    -- Поліграфія з призначеним погоджувачем: він сам АБО другий СЕО.
    when (select is_print from target) and (select print_approver from target) is not null
      then _user_id = (select print_approver from target)
        or exists (
          select 1
            from tosho.memberships m
           where m.user_id = _user_id
             and lower(coalesce(m.job_role::text, '')) = 'seo'
        )
    -- Мерч, «інше», а також поліграфія без налаштування — старе правило.
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
--   select tosho.is_quote_markup_approver(<Олена>,     <поліграфічний прорахунок>); -- t
--   select tosho.is_quote_markup_approver(<другий СЕО>, <поліграфічний прорахунок>); -- t
--   select tosho.is_quote_markup_approver(<головбух>,  <поліграфічний прорахунок>); -- f
