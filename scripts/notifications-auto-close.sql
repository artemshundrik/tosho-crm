-- ---------------------------------------------------------------------------
-- Сповіщення-прохання закриваються самі, коли прохання виконано (хвиля В2,
-- картка 346, рішення 3).
--
-- «Внести номер з BAS» лишалось у «Вхідних» після того, як рахунок виписали,
-- і бухгалтер закривав його руками — або не закривав, і число на дзвонику
-- брехало. Тепер стан справи сам гасить своє прохання:
--
--   рахунок на замовленні виписано або запит повернено  → «Рахунок на … — внести номер з BAS»
--   погодження договору / СП / запуску вирішено чи відкликано → «…: погодити …», «…: просять запустити без умов»
--   на прорахунку не лишилось запитів «ціна нижче дна»  → «Ціна нижче дна — потрібне рішення»
--   на замовлення внесено оплату                         → «Замовник каже, що оплатив · …»
--   макет пішов далі з перевірки PM / з погодження       → «Макет передано на перевірку PM / на погодження»
--
-- Зіставлення — за href справи й заголовком прохання: категорії в рядку
-- сповіщення немає, а заголовки цих прохань сталі (workflowNotifications.ts).
-- Закрите сповіщення отримує read_at і metadata.auto_closed — людський підпис
-- причини, який «Усі» показують замість «готово».
--
-- Функції SECURITY DEFINER: прохання лежить у сповіщеннях ІНШИХ людей
-- (бухгалтер виписав — гасне в усіх бухгалтерів), а політика дозволяє оновлювати
-- лише свої. Пише рівно два поля, лише в непрочитаних рядках із точним href.
--
-- Застосування: npm run db:apply scripts/notifications-auto-close.sql
-- ---------------------------------------------------------------------------

-- Тригер шукає непрочитане за точним href — без індексу це прохід усієї таблиці.
create index if not exists notifications_open_href_idx
  on public.notifications (href)
  where read_at is null;

create or replace function tosho.auto_close_notifications(p_href text, p_titles text[], p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = timezone('utc', now()),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('auto_closed', p_reason)
   where read_at is null
     and href = p_href
     and title like any (p_titles);
$$;

revoke all on function tosho.auto_close_notifications(text, text[], text) from public, anon, authenticated;

comment on function tosho.auto_close_notifications(text, text[], text) is
  'Гасить непрочитані сповіщення-прохання справи (href + шаблони заголовка), ставить metadata.auto_closed. Лише для тригерів автозакриття.';

-- Рахунок ------------------------------------------------------------------

create or replace function tosho.auto_close_invoice_request_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tosho.auto_close_notifications(
    '/orders/production/' || new.id,
    array['Рахунок на % — внести номер з BAS'],
    case when new.invoice_number is not null and old.invoice_number is null
      then 'рахунок виписано' else 'запит повернено' end
  );
  return null;
end;
$$;

drop trigger if exists orders_auto_close_invoice_notifications on tosho.orders;
create trigger orders_auto_close_invoice_notifications
  after update of invoice_number, invoice_return_note on tosho.orders
  for each row
  when (
    (new.invoice_number is not null and old.invoice_number is null)
    or (new.invoice_return_note is not null and old.invoice_return_note is null)
  )
  execute function tosho.auto_close_invoice_request_notifications();

-- Погодження договору, СП, запуску ----------------------------------------

create or replace function tosho.auto_close_order_approval_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tosho.auto_close_notifications(
    '/orders/production/' || new.order_id,
    array[case new.kind
      when 'contract' then '%: погодити договір'
      when 'specification' then '%: погодити СП'
      else '%: просять запустити без умов'
    end],
    case new.status
      when 'approved' then 'погоджено'
      when 'returned' then 'повернуто'
      else 'запит відкликано'
    end
  );
  return null;
end;
$$;

drop trigger if exists order_approvals_auto_close_notifications on tosho.order_approvals;
create trigger order_approvals_auto_close_notifications
  after update of status on tosho.order_approvals
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute function tosho.auto_close_order_approval_notifications();

-- Ціна нижче дна -----------------------------------------------------------
-- Одне сповіщення на прорахунок, хоч тиражів у запиті кілька, тож гасне лише
-- тоді, коли нерозв'язаних запитів на прорахунку не лишилось.

create or replace function tosho.auto_close_markup_request_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from tosho.quote_run_markup_approvals
     where quote_id = new.quote_id and status = 'pending'
  ) then
    return null;
  end if;
  perform tosho.auto_close_notifications(
    '/orders/estimates/' || new.quote_id,
    array['Ціна нижче дна — потрібне рішення'],
    case new.status
      when 'approved' then 'ціну підтверджено'
      when 'rejected' then 'ціну відхилено'
      else 'запит відкликано'
    end
  );
  return null;
end;
$$;

drop trigger if exists quote_run_markup_approvals_auto_close_notifications on tosho.quote_run_markup_approvals;
create trigger quote_run_markup_approvals_auto_close_notifications
  after update of status on tosho.quote_run_markup_approvals
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute function tosho.auto_close_markup_request_notifications();

-- «Замовник каже, що оплатив» ---------------------------------------------

create or replace function tosho.auto_close_payment_check_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tosho.auto_close_notifications(
    '/orders/production/' || new.order_id,
    array['Замовник каже, що оплатив · %'],
    'оплату внесено'
  );
  return null;
end;
$$;

drop trigger if exists finance_payments_auto_close_notifications on tosho.finance_payments;
create trigger finance_payments_auto_close_notifications
  after insert on tosho.finance_payments
  for each row
  when (new.order_id is not null and new.cancelled_at is null)
  execute function tosho.auto_close_payment_check_notifications();

-- Макет пішов далі ---------------------------------------------------------
-- Статус дизайн-задачі живе в metadata рядка activity_log (action = design_task).

create or replace function tosho.auto_close_design_review_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tosho.auto_close_notifications(
    '/design/' || new.id,
    array[case old.metadata->>'status'
      when 'pm_review' then 'Макет передано на перевірку PM'
      else 'Макет передано на погодження'
    end],
    'макет пішов далі'
  );
  return null;
end;
$$;

drop trigger if exists activity_log_auto_close_design_notifications on public.activity_log;
create trigger activity_log_auto_close_design_notifications
  after update of metadata on public.activity_log
  for each row
  when (
    old.action = 'design_task'
    and old.metadata->>'status' in ('pm_review', 'client_review')
    and new.metadata->>'status' is distinct from old.metadata->>'status'
  )
  execute function tosho.auto_close_design_review_notifications();

revoke all on function tosho.auto_close_invoice_request_notifications() from public, anon, authenticated;
revoke all on function tosho.auto_close_order_approval_notifications() from public, anon, authenticated;
revoke all on function tosho.auto_close_markup_request_notifications() from public, anon, authenticated;
revoke all on function tosho.auto_close_payment_check_notifications() from public, anon, authenticated;
revoke all on function tosho.auto_close_design_review_notifications() from public, anon, authenticated;

-- Разово: прохання, виконані ДО цього файлу -------------------------------
-- Інакше «Вхідні» так і тримали б десятки вже виписаних рахунків.

update public.notifications n
   set read_at = timezone('utc', now()),
       metadata = coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object('auto_closed',
         case when o.invoice_number is not null then 'рахунок виписано' else 'запит повернено' end)
  from tosho.orders o
 where n.read_at is null
   and n.title like 'Рахунок на % — внести номер з BAS'
   and n.href = '/orders/production/' || o.id
   and (o.invoice_number is not null or o.invoice_requested_at is null);

update public.notifications n
   set read_at = timezone('utc', now()),
       metadata = coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object('auto_closed', 'вирішено')
  from tosho.orders o
 where n.read_at is null
   and n.href = '/orders/production/' || o.id
   and (
     (n.title like '%: погодити договір' and not exists (
       select 1 from tosho.order_approvals a where a.order_id = o.id and a.kind = 'contract' and a.status = 'pending'))
     or (n.title like '%: погодити СП' and not exists (
       select 1 from tosho.order_approvals a where a.order_id = o.id and a.kind = 'specification' and a.status = 'pending'))
     or (n.title like '%: просять запустити без умов' and not exists (
       select 1 from tosho.order_approvals a where a.order_id = o.id and a.kind = 'launch' and a.status = 'pending'))
   );

update public.notifications n
   set read_at = timezone('utc', now()),
       metadata = coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object('auto_closed', 'вирішено')
  from tosho.quotes q
 where n.read_at is null
   and n.title = 'Ціна нижче дна — потрібне рішення'
   and n.href = '/orders/estimates/' || q.id
   and not exists (
     select 1 from tosho.quote_run_markup_approvals m where m.quote_id = q.id and m.status = 'pending');

update public.notifications n
   set read_at = timezone('utc', now()),
       metadata = coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object('auto_closed', 'оплату внесено')
  from tosho.orders o
 where n.read_at is null
   and n.title like 'Замовник каже, що оплатив · %'
   and n.href = '/orders/production/' || o.id
   and exists (
     select 1 from tosho.finance_payments p
      where p.order_id = o.id and p.cancelled_at is null and p.created_at >= n.created_at);

update public.notifications n
   set read_at = timezone('utc', now()),
       metadata = coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object('auto_closed', 'макет пішов далі')
  from public.activity_log t
 where n.read_at is null
   and t.action = 'design_task'
   and n.href = '/design/' || t.id
   and (
     (n.title = 'Макет передано на перевірку PM' and coalesce(t.metadata->>'status', '') <> 'pm_review')
     or (n.title = 'Макет передано на погодження' and coalesce(t.metadata->>'status', '') <> 'client_review')
   );
