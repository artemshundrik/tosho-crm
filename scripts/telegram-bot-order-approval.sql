-- =====================================================================
-- Погодження договору й СП з Telegram-бота: tosho.bot_decide_order_approval
-- (REQ-356#p1)
--
-- Бухгалтер або СЕО бачить у боті віджет СП і тисне «Погодити». У вебхука
-- немає JWT людини — лише telegram_chat_id, перевірений при прив'язці.
-- Писати сервісною роллю не можна: тригер enforce_order_approval_flow при
-- порожньому auth.uid() пропускає БУДЬ-ЩО — без перевірки, хто погоджує, і
-- без decided_by. Кнопку натиснув би будь-хто, кому переслали повідомлення.
--
-- Рішення як у tosho.bot_submit_absence: функція ПЕРЕВТІЛЮЄТЬСЯ в людину
-- (request.jwt.claims + SET LOCAL ROLE authenticated) і робить звичайний
-- UPDATE. Тоді RLS order_approvals_update перевіряє команду, а тригер —
-- is_order_approver, decided_by і decided_at, точно як у CRM. Правила
-- живуть в одному місці.
--
-- Лише approved. «Повернути» з бота не робимо: тригер вимагає записку, що
-- виправити, а її зручніше писати в CRM. Кнопка «Повернути» веде туди.
--
-- SECURITY INVOKER навмисно: у security definer Postgres забороняє SET ROLE.
-- Викликати може ЛИШЕ service_role: p_user_id — параметр, і з грантом для
-- authenticated будь-хто погоджував би від чужого імені.
--
-- Повертає рядок рішення, або null, якщо запит уже не на погодженні
-- (погодив хтось інший, відкликали) — вебхук тоді каже це людині.
--
-- Застосування: npm run db:apply scripts/telegram-bot-order-approval.sql
-- =====================================================================

begin;

create or replace function tosho.bot_decide_order_approval(
  p_user_id uuid,
  p_approval_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'tosho', 'public'
as $$
declare
  v_caller text := current_user;
  v_row tosho.order_approvals%rowtype;
begin
  if p_user_id is null or p_approval_id is null then
    raise exception 'Немає користувача або запиту';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- where status = 'pending': друге натискання або погодження з CRM тим
  -- часом дають 0 рядків, а не виняток тригера «рішення вже ухвалене».
  update tosho.order_approvals
     set status = 'approved'
   where id = p_approval_id
     and status = 'pending'
     and kind in ('contract', 'specification')
  returning * into v_row;

  execute format('set local role %I', v_caller);

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'team_id', v_row.team_id,
    'order_id', v_row.order_id,
    'kind', v_row.kind,
    'status', v_row.status,
    'requested_by', v_row.requested_by,
    'decided_by', v_row.decided_by,
    'decided_at', v_row.decided_at
  );
end;
$$;

revoke all on function tosho.bot_decide_order_approval(uuid, uuid) from public;
revoke all on function tosho.bot_decide_order_approval(uuid, uuid) from anon;
revoke all on function tosho.bot_decide_order_approval(uuid, uuid) from authenticated;
grant execute on function tosho.bot_decide_order_approval(uuid, uuid) to service_role;

commit;
