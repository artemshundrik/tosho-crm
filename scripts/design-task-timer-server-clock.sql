-- Час таймерів дизайну ставить БАЗА, а не годинник комп'ютера.
--
-- ЩО ЛІКУЄ. `started_at` і `paused_at` приходили з браузера (`new Date()`).
-- 06.11.2026 годинник дизайнерки відставав на 45 хв, і вона вже запускала таймер
-- з таким зсувом. Поки зсув однаковий на початку й наприкінці, тривалість
-- правильна. Але виправила годинник посеред сесії — і тривалість зсувається на
-- весь зсув, а цей час іде в аналітику й у зарплату дизайнерів.
--
-- ЧОМУ ТРИГЕР, А НЕ ПРАВКА КЛІЄНТА. Старі вкладки з попереднім бандлом живуть
-- тижнями й далі шлють свій час. Той самий прийом, що й для присутності
-- (scripts/presence-server-clock.sql).
--
-- ЧОМУ ЛИШЕ `authenticated`. Планувальник design-timer-reminders ходить під
-- service role і навмисно пише минулу дату: закриває забуту сесію на
-- `started_at + 8 год`, а порожню — на `started_at`. Його й ручні виправлення
-- адміністратора в SQL чіпати не можна.
--
-- ЩО З УЖЕ ЗАПИСАНИМ. Нічого: із 1213 сесій зсув понад 5 хв лише в одній, і
-- тривалість там правильна. Від'ємних тривалостей немає.
--
-- БЕЗПЕЧНО ЗАСТОСОВУВАТИ ПОВТОРНО: create or replace + drop if exists.
-- Порядок відносно деплою неважливий: клієнт працює і до, і після.

create or replace function public.design_task_timer_stamp_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stopping boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Сесія завжди народжується запущеною: готових «я працював дві години» з
    -- браузера не буває, у застосунку такого запису немає.
    new.started_at := now();
    new.created_at := now();
    new.paused_at := null;
    return new;
  end if;

  -- Єдине, що браузер має право зробити з наявною сесією, — зупинити відкриту.
  -- Решта заморожена цілком, а не лише час: політика RLS пускає будь-якого члена
  -- команди, і без цього `user_id` закритої сесії можна було б переписати на
  -- себе й забрати чужі години із зарплати. Застосунок інших правок не робить.
  -- Нова колонка, яку браузер мусить міняти, дописується сюди явно.
  stopping := old.paused_at is null and new.paused_at is not null;
  new := old;
  if stopping then
    -- Клієнт шле значення, бо йому треба сказати «зупинити», а не «о котрій».
    new.paused_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists design_task_timer_stamp_server_time on public.design_task_timer_sessions;

create trigger design_task_timer_stamp_server_time
  before insert or update on public.design_task_timer_sessions
  for each row
  execute function public.design_task_timer_stamp_server_time();
