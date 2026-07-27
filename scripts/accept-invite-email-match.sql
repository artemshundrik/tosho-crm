-- =====================================================================
-- accept-invite-email-match.sql
-- Запрошення приймає лише той, кому воно адресоване.
--
-- Проблема: tosho.accept_workspace_invite() перевіряла лише те, що токен
-- існує, не використаний і не протух — але НЕ те, що його пред'явник і є
-- запрошеною людиною. Перевірка збігу email жила тільки в UI
-- (src/pages/InvitePage.tsx, emailMismatch), а сама RPC має EXECUTE для
-- authenticated, тож її можна викликати напряму в обхід сторінки.
--
-- Чому це важило: RLS-політика invites_select_owner_admin дає адмінам
-- читати токени ВСІХ запрошень воркспейсу, а membership пишеться через
-- on conflict do update set role = excluded.role. Отже адмін (не owner) міг
-- узяти токен чужого запрошення з роллю owner і підняти собі роль до owner.
--
-- Тепер email пред'явника звіряється з email запрошення. Це також робить
-- безпечнішою нову видачу посилань входу з картки команди: переслане далі
-- посилання вже не редимиться випадковим залогіненим користувачем.
--
-- Тіло функції збережене без змін, окрім доданої перевірки.
-- Ідемпотентно: можна виконувати повторно.
-- =====================================================================

create or replace function tosho.accept_workspace_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path to 'tosho', 'public', 'auth'
as $function$
declare
  v_inv tosho.workspace_invites%rowtype;
  v_membership_id uuid;
  v_team_id uuid;
  v_caller_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select *
  into v_inv
  from tosho.workspace_invites
  where token = p_token
  limit 1;

  if v_inv.id is null then
    raise exception 'invite not found';
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'invite already accepted';
  end if;

  if v_inv.expires_at < now() then
    raise exception 'invite expired';
  end if;

  -- Запрошення іменне: приймає лише власник тієї поштової скриньки.
  -- Email читаємо з auth.users, а не з claims JWT: таблиця авторитетна.
  select lower(u.email)
  into v_caller_email
  from auth.users u
  where u.id = auth.uid();

  if v_caller_email is null or v_caller_email is distinct from lower(v_inv.email) then
    raise exception 'invite email mismatch';
  end if;

  -- створюємо/оновлюємо CRM membership
  insert into tosho.memberships (workspace_id, user_id, role, job_role, created_by)
  values (v_inv.workspace_id, auth.uid(), v_inv.access_role, v_inv.job_role, auth.uid())
  on conflict (workspace_id, user_id)
  do update set
    role = excluded.role,
    job_role = excluded.job_role,
    updated_at = now()
  returning id into v_membership_id;

  -- зв'язуємо з public.team_members через team_id автора інвайту
  select tm.team_id
  into v_team_id
  from public.team_members tm
  where tm.user_id = v_inv.created_by
  limit 1;

  if v_team_id is not null then
    insert into public.team_members (team_id, user_id, role)
    values (
      v_team_id,
      auth.uid(),
      case
        when v_inv.access_role = 'owner' then 'super_admin'
        when v_inv.access_role = 'admin' then 'manager'
        else 'viewer'
      end
    )
    on conflict (team_id, user_id) do nothing;
  end if;

  update tosho.workspace_invites
  set accepted_at = now(),
      accepted_by = auth.uid()
  where id = v_inv.id;

  return v_membership_id;
end;
$function$;

comment on function tosho.accept_workspace_invite(uuid) is
  'Приймає запрошення за токеном. Вимагає, щоб email того, хто приймає, збігався з email запрошення — інакше будь-хто з токеном міг би забрати чужу роль.';
