-- REQ-184 · Час присутності ставить БАЗА, а не годинник клієнта.
--
-- ЩО ЛІКУЄ. `public.user_presence.last_seen_at` дотепер приходив із браузера:
-- useWorkspacePresenceState клав у upsert `new Date().toISOString()`. Машина,
-- годинник якої спішить, писала позначку з майбутнього — і для всіх інших
-- людина лишалась «онлайн» доти, доки реальний час не наздожене той годинник.
-- При збої на добу це доба фальшивої присутності: у CRM, у Пульсі, у звітах
-- керівництву і в Telegram-асистенті.
--
-- Клієнтський бік уже не вірить майбутнім позначкам (src/lib/presenceWindow.ts,
-- допуск 5 хвилин на дрейф). Але це захист на читанні: у самій базі й далі
-- лежали б брехливі значення, і кожен НОВИЙ читач починав би з тієї ж дірки.
-- Тригер прибирає причину: хай клієнт шле що завгодно — записується `now()`.
--
-- ЧОМУ ТРИГЕР, А НЕ DEFAULT. Default спрацьовує лише коли колонки в запиті
-- немає, а клієнт її шле завжди. Переписувати запит замало: старі вкладки з
-- попереднім бандлом житимуть ще тижні.
--
-- БЕЗПЕЧНО ЗАСТОСОВУВАТИ ПОВТОРНО: create or replace + drop if exists.

create or replace function public.user_presence_stamp_server_time()
returns trigger
language plpgsql
as $$
begin
  -- Час пише сервер. Значення з клієнта ігнорується повністю: жодного
  -- «беремо менше з двох» — годинник, що ВІДСТАЄ, так само не має права
  -- зістарювати чужу присутність.
  new.last_seen_at := now();
  return new;
end;
$$;

drop trigger if exists user_presence_stamp_server_time on public.user_presence;

create trigger user_presence_stamp_server_time
  before insert or update on public.user_presence
  for each row
  execute function public.user_presence_stamp_server_time();

-- Разова чистка вже записаного майбутнього: без неї збиті позначки
-- доживатимуть до наступного пінгу тієї ж людини, а якщо вона у відпустці —
-- то й довше.
update public.user_presence
   set last_seen_at = now()
 where last_seen_at > now();
