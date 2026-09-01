-- ---------------------------------------------------------------------------
-- Ціну поліграфії нижче дна погоджує ОДНА людина, а не роль (REQ-182).
--
-- НАВІЩО. Погодження накрутки заводили під правило «двоє СЕО або головний
-- бухгалтер — будь-хто з трьох». Для мерчу воно чинне й лишається. Але шкала
-- типів угоди прийшла від Олени, домовленість про дно — її, і Артем
-- 01.09.2026 сказав прямо: на поліграфії затверджує саме вона, а не будь-який
-- СЕО. Роль тут не підходить: СЕО в компанії двоє.
--
-- ЧОМУ НЕ КОНСТАНТА В КОДІ. Репозиторій публічний, і ставити в нього
-- ідентифікатор конкретного співробітника не варто. Плюс людина на цій ролі
-- колись зміниться, а перевипуск застосунку заради заміни прізвища — погана
-- ціна. Тому це НАЛАШТУВАННЯ поруч зі ставками, які вже живуть на робочому
-- просторі.
--
-- ЩО БУДЕ, ЯКЩО ПОЛЕ ПОРОЖНЄ. Діє старе правило (owner / СЕО / головбух).
-- Це навмисно: незаповнене налаштування не має означати «поліграфію не може
-- погодити ніхто» — прорахунок завис би назавжди, і ніхто б не зрозумів чому.
--
-- Застосування: npm run db:apply scripts/quote-print-markup-approver.sql
-- ---------------------------------------------------------------------------

alter table tosho.company_pricing_rates
  add column if not exists print_markup_approver_user_id uuid;

comment on column tosho.company_pricing_rates.print_markup_approver_user_id is
  'Хто затверджує накрутку нижче дна на ПОЛІГРАФІЧНИХ прорахунках (REQ-182). Порожньо — діє загальне правило owner/СЕО/головбух.';

-- Підставляємо Олену пошуком, а не готовим ідентифікатором: у публічному
-- репозиторії ідентифікатор співробітника не потрібен, а ім'я тут і так
-- сказано в поясненні вище.
update tosho.company_pricing_rates r
   set print_markup_approver_user_id = (
     select m.user_id
       from tosho.memberships m
       join tosho.team_member_profiles p on p.user_id = m.user_id
      where lower(coalesce(m.job_role::text, '')) = 'seo'
        and p.first_name ilike 'Олена'
        and m.workspace_id = r.workspace_id
      limit 1
   )
 where r.print_markup_approver_user_id is null;

-- ---------------------------------------------------------------------------
-- Правило прав тепер залежить від прорахунку, а не лише від людини.
--
-- Стара однопараметрична форма ЛИШАЄТЬСЯ: її кличуть політики й тригери, які
-- прорахунку не бачать, і зривати їх заради цієї задачі немає причини. Нова
-- форма додає друге питання — «а який це прорахунок».
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
    -- Поліграфія з призначеним погоджувачем — тільки він.
    when (select is_print from target) and (select print_approver from target) is not null
      then _user_id = (select print_approver from target)
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

-- ---------------------------------------------------------------------------
-- Тригер рішення переходить на нову форму.
--
-- Без цього кроку правило лишилось би тільки в інтерфейсі: другий СЕО не бачив
-- би кнопки, але міг би поставити рішення запитом до бази. Тіло функції нижче —
-- дослівна копія з scripts/quote-markup-approvals.sql, змінені лише два виклики
-- перевірки прав і текст помилки (роль у ньому більше не називається, бо
-- погоджувач тепер залежить від прорахунку).
-- ---------------------------------------------------------------------------

create or replace function tosho.enforce_quote_markup_approval_flow()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'Запит на погодження заводиться у стані «на погодженні»'
        using errcode = '42501';
    end if;
    new.requested_by := coalesce(new.requested_by, auth.uid());
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    return new;
  end if;

  -- Число, на яке просили, після заведення не міняється НІКОЛИ. Треба інше —
  -- це інший запит, і погоджувач має побачити його як новий.
  if new.markup_rate is distinct from old.markup_rate
     or new.cost_total is distinct from old.cost_total
     or new.run_id is distinct from old.run_id
     or new.quote_id is distinct from old.quote_id
     or new.requested_by is distinct from old.requested_by then
    raise exception 'Заведений запит не переписується — заведіть новий'
      using errcode = '42501';
  end if;

  if old.status <> 'pending' then
    raise exception 'Рішення вже ухвалене — його не переглядають правкою рядка'
      using errcode = '42501';
  end if;

  if new.status in ('approved', 'rejected') then
    if not tosho.is_quote_markup_approver(auth.uid(), new.quote_id) then
      raise exception 'Погодити цю накрутку може лише призначений погоджувач'
        using errcode = '42501';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := timezone('utc', now());
    return new;
  end if;

  -- «Відкликано» ставить сам застосунок, коли менеджер підняв накрутку на дно
  -- або вище: запит став безпредметним, і висіти в черзі погоджувача не має.
  if new.status = 'withdrawn' then
    if auth.uid() is distinct from old.requested_by
       and not tosho.is_quote_markup_approver(auth.uid(), old.quote_id) then
      raise exception 'Відкликати запит може його автор'
        using errcode = '42501';
    end if;
    new.decided_at := timezone('utc', now());
    return new;
  end if;

  raise exception 'Невідомий стан запиту: %', new.status using errcode = '22023';
end;
$$;


revoke all on function tosho.enforce_quote_markup_approval_flow() from public;

-- Тригер уже висить на таблиці — create or replace підмінив тіло функції.

-- Перевірка після застосування:
--   select p.first_name, p.last_name
--     from tosho.company_pricing_rates r
--     join tosho.team_member_profiles p on p.user_id = r.print_markup_approver_user_id;
--   -- очікувано: Олена
