-- ---------------------------------------------------------------------------
-- set_quote_status повідомляє, чи справді змінився статус (REQ-231).
--
-- ЩО ЛАМАЛОСЯ. 25.08.2026 о 09:52 власнику прийшло ЧОТИРИ однакові
-- «Прорахунок затверджено» — при ОДНОМУ рядку в quote_status_history. 07.08 —
-- дві копії. За 60 днів це два випадки на 224 переходи.
--
-- ЧОМУ ІСТОРІЯ МОВЧИТЬ, А БОТ КРИЧИТЬ. Тригери історії й штампів мають
-- `when (old.status is distinct from new.status)`, тож холостий перехід база
-- ковтає мовчки — і правильно робить. А застосунок про це не дізнається:
-- функція повертала void, тобто «змінив» і «нічого не змінив» виглядали для
-- нього однаково, і notifyQuoteInitiatorOnStatusChange викликався після
-- КОЖНОГО виклику. Звідси й чотири повідомлення при одному рядку історії.
--
-- ЧОМУ НЕ ВИСТАЧИЛО ПЕРЕВІРКИ В ЗАСТОСУНКУ. На дошці вже стоїть «кинули туди,
-- де й було — нічого не робимо». Вона знімає найчастіший випадок, але дивиться
-- у власний стан вкладки, а не в базу: ні сусідньої вкладки, ні іншої людини
-- вона не бачить. Будь-яка перевірка ПЕРЕД записом лишає щілину між читанням
-- і записом — це та сама помилка, яку 31.08 виправляли на дошці дизайну.
--
-- РІШЕННЯ — ТЕ САМЕ, ЩО В ДИЗАЙНІ: хай вирішує сам запис. UPDATE отримує умову
-- `status is distinct from p_new_status`, а функція повертає `found` — true
-- рівно тоді, коли рядок справді змінився. Між WHERE і SET одного UPDATE
-- влізти нема куди, тож із двох одночасних викликів один дістає true, другий
-- false, і сповіщення йде один раз.
--
-- DROP + CREATE, а не CREATE OR REPLACE: тип, що повертається, заміною тіла не
-- міняється. Явних прав на функції немає (proacl порожній), тож після
-- перестворення діють ті самі типові права, що й були.
--
-- Історію, decided_at і sent_at, як і раніше, пише тригер — тут нічого не
-- дублюємо (див. scripts/quote-status-audit-trigger.sql).
-- ---------------------------------------------------------------------------

drop function if exists tosho.set_quote_status(uuid, tosho.quote_status, text);

create function tosho.set_quote_status(
  p_quote_id uuid,
  p_new_status tosho.quote_status,
  p_note text default null
)
returns boolean
language plpgsql
as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from tosho.quotes where id = p_quote_id;

  if v_team_id is null then
    raise exception 'Quote not found';
  end if;

  if not public.is_team_member(v_team_id) then
    raise exception 'Not allowed';
  end if;

  -- Нотатку підхопить тригер історії в межах цієї ж транзакції.
  perform set_config('tosho.status_note', coalesce(p_note, ''), true);

  -- Умова стоїть у самому записі: холостий перехід не чіпає жодного рядка, і
  -- `found` чесно каже про це викликачеві. sent_at / decided_at проставляє
  -- BEFORE-тригер, тут лише статус.
  update tosho.quotes
     set status = p_new_status
   where id = p_quote_id
     and status is distinct from p_new_status;

  return found;
end;
$$;

comment on function tosho.set_quote_status(uuid, tosho.quote_status, text) is
  'Міняє статус прорахунку. Повертає true, якщо статус справді змінився, і false, якщо він уже був таким — щоб застосунок не слав сповіщення про холостий перехід (REQ-231).';
