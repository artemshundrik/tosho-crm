-- REQ-149 · Погодження накрутки нижче дна 20 % — бік бази.
--
-- НАВІЩО. Дно накрутки (MIN_MARKUP_RATE = 20 %) свідомо НЕ блокує роботу:
-- рівно тверда заборона на попередньому порозі й народжувала фіктивні суми.
-- TS-0826-0039: проджект вписав 1000 ₴ о 08:13 лише щоб зняти блокування,
-- менеджер виправив на 500 ₴ о 08:15. Тому нижче дна прорахунок далі
-- редагується й зберігається, а замикаються ЛИШЕ двері назовні — КП клієнту
-- й перехід у «Затверджено».
--
-- Рішення СЕО 30.08.2026: запит іде трьом — двом СЕО і головному бухгалтеру;
-- підтвердити або відхилити може будь-хто з них. На відхилення число
-- менеджера ЛИШАЄТЬСЯ з міткою «відхилено», автоматичного відкату до 20 %
-- немає.
--
-- ЧОМУ ОКРЕМА ТАБЛИЦЯ, А НЕ КОЛОНКИ В quote_item_runs. Запит — це подія з
-- автором, часом, рішенням і тим, хто його ухвалив; колонками це стає п'ятьма
-- полями, які треба чистити руками при кожному новому запиті, а історія
-- «просили тричі, двічі відхилили» зникає взагалі. Саме ця історія й потрібна:
-- без неї відповідь на «чому ця угода пішла на 15 %» лишається в чиїйсь пам'яті.
--
-- ЩО СВІДОМО НЕ ЗБЕРІГАЄТЬСЯ: чи погодження ще ДІЙСНЕ. Це похідне від рядка
-- тиражу, а не факт: погодження прив'язане до конкретного числа, і зміна
-- собівартості або накрутки ВНИЗ відкриває запит наново (пункт p5 картки).
-- Зберігати такий прапорець означало б тримати тригер, який ганяється за
-- кожною правкою тиражу й тихо розходиться з дійсністю. Замість цього рядок
-- запиту пам'ятає, НА ЯКОМУ числі його ухвалили (markup_rate + cost_total), а
-- дійсність рахує одна чиста функція — src/lib/quoteMarkupApproval.ts.
--
-- Безпечно застосовувати повторно.

create table if not exists tosho.quote_run_markup_approvals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  quote_id uuid not null references tosho.quotes(id) on delete cascade,
  run_id uuid not null references tosho.quote_item_runs(id) on delete cascade,
  status text not null default 'pending',
  -- Число, НА ЯКЕ просили, і собівартість, ПРИ ЯКІЙ просили. Разом вони і є
  -- «конкретне число» з домовленості: доки тираж не став гіршим за них,
  -- рішення діє; став гіршим — запит відкривається наново.
  markup_rate numeric not null,
  cost_total numeric not null,
  request_note text,
  requested_by uuid,
  requested_at timestamptz not null default timezone('utc', now()),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);

comment on table tosho.quote_run_markup_approvals is
  'Запити на погодження накрутки нижче дна 20 % (REQ-149). Один рядок = один запит на конкретний тираж і конкретне число. Дійсність рішення похідна: див. src/lib/quoteMarkupApproval.ts.';

alter table tosho.quote_run_markup_approvals
  drop constraint if exists quote_run_markup_approvals_status_chk;
alter table tosho.quote_run_markup_approvals
  add constraint quote_run_markup_approvals_status_chk
  check (status in ('pending', 'approved', 'rejected', 'withdrawn'));

-- Один живий запит на тираж. Без цього подвійний клік або дві вкладки дають
-- два «на погодженні» на одне число, і погоджувач бачить дубль у списку.
create unique index if not exists quote_run_markup_approvals_one_pending_idx
  on tosho.quote_run_markup_approvals (run_id)
  where status = 'pending';

create index if not exists quote_run_markup_approvals_run_idx
  on tosho.quote_run_markup_approvals (run_id, requested_at desc);

create index if not exists quote_run_markup_approvals_quote_idx
  on tosho.quote_run_markup_approvals (quote_id, requested_at desc);

-- Хто ухвалює рішення: два СЕО і головний бухгалтер (owner лишається як
-- наскрізний доступ власника, а не як окрема роль погоджувача).
create or replace function tosho.is_quote_markup_approver(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
  select exists (
    select 1
    from tosho.memberships m
    where m.user_id = _user_id
      and (
        lower(coalesce(m.role::text, '')) = 'owner'
        or lower(coalesce(m.job_role::text, '')) in ('seo', 'chief_accountant')
      )
  );
$$;

revoke all on function tosho.is_quote_markup_approver(uuid) from public;
grant execute on function tosho.is_quote_markup_approver(uuid) to authenticated;

-- Правила переходів — тригером, а не політикою RLS.
--
-- Політика вміє сказати «цей рядок тобі можна оновлювати», але не вміє
-- порівняти old і new: саме тому запит із неї можна було б переписати на інше
-- число вже ПІСЛЯ підтвердження — тобто рівно та діра «погодили 15 %, потім
-- переписали», від якої вся ця таблиця й заводиться.
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
    if not tosho.is_quote_markup_approver(auth.uid()) then
      raise exception 'Погодити накрутку може СЕО або головний бухгалтер'
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
       and not tosho.is_quote_markup_approver(auth.uid()) then
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

drop trigger if exists quote_run_markup_approvals_flow on tosho.quote_run_markup_approvals;
create trigger quote_run_markup_approvals_flow
before insert or update on tosho.quote_run_markup_approvals
for each row execute function tosho.enforce_quote_markup_approval_flow();

-- Поки запит на погодженні — саме число не рухається.
--
-- Інакше погодження стосувалося б не того, що поїде клієнту: погоджувач бачить
-- 15 %, а в базі вже 12 %. У ЗАСТОСУНКУ поле заморожене й після підтвердження,
-- але в базі тримаємо лише «на погодженні»: підтверджене число захищає інше
-- правило — опустити його нижче можна, і це САМО́ по собі відкриває запит
-- наново й замикає двері. Тобто після підтвердження заморозка — зручність
-- інтерфейсу, а на погодженні — цілісність рішення.
create or replace function tosho.freeze_quote_run_markup_while_pending()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.markup_rate is not distinct from old.markup_rate then
    return new;
  end if;
  if exists (
    select 1
    from tosho.quote_run_markup_approvals a
    where a.run_id = new.id
      and a.status = 'pending'
  ) then
    raise exception 'Накрутка заморожена до відповіді на запит погодження'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function tosho.freeze_quote_run_markup_while_pending() from public;

drop trigger if exists quote_item_runs_freeze_markup_while_pending on tosho.quote_item_runs;
create trigger quote_item_runs_freeze_markup_while_pending
before update on tosho.quote_item_runs
for each row execute function tosho.freeze_quote_run_markup_while_pending();

alter table tosho.quote_run_markup_approvals enable row level security;

-- Схема tosho роздає гранти новим таблицям автоматично, і anon дістає їх разом
-- з усіма. Тут це неприпустимо навіть під RLS: запити на знижену ціну — це
-- внутрішня кухня, і анонімному ключу вона недоступна за жодних умов.
revoke all on tosho.quote_run_markup_approvals from anon;

-- Читає вся команда. Запит на знижену ціну — не приватність однієї людини:
-- бухгалтерія й проджект бачать той самий стан тиражу в картці.
drop policy if exists "quote_run_markup_approvals_select" on tosho.quote_run_markup_approvals;
create policy "quote_run_markup_approvals_select"
on tosho.quote_run_markup_approvals
for select
to authenticated
using (public.is_team_member(team_id));

-- Запис прив'язується до СВОГО прорахунку, а не до будь-якого.
--
-- `is_team_member(team_id)` саме по собі перевіряє лише те, що людина в цій
-- команді: team_id приходить від клієнта й ні з чим не звірявся, тож рядок міг
-- вказувати на тираж чужої команди. Доступу це не давало (чужа команда такого
-- рядка не бачить), але лишало в таблиці записи, які не стосуються нічого
-- видимого. Звіряємо трійку team_id → quote_id → run_id одразу.
drop policy if exists "quote_run_markup_approvals_insert" on tosho.quote_run_markup_approvals;
create policy "quote_run_markup_approvals_insert"
on tosho.quote_run_markup_approvals
for insert
to authenticated
with check (
  public.is_team_member(team_id)
  and exists (
    select 1
    from tosho.quote_item_runs r
    join tosho.quotes q on q.id = r.quote_id
    where r.id = quote_run_markup_approvals.run_id
      and r.quote_id = quote_run_markup_approvals.quote_id
      and q.team_id = quote_run_markup_approvals.team_id
  )
);

drop policy if exists "quote_run_markup_approvals_update" on tosho.quote_run_markup_approvals;
create policy "quote_run_markup_approvals_update"
on tosho.quote_run_markup_approvals
for update
to authenticated
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

-- Видалення немає навмисно: історія запитів і є відповіддю на питання «чому ця
-- угода пішла нижче дна».
