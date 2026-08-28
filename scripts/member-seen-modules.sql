-- REQ-199 · Які розділи людина вже бачила в меню.
--
-- НАВІЩО. Коли людині відкривають доступ до розділу, вона про це не дізнається
-- — хіба хтось скаже в чаті. Те саме з новим розділом у CRM. Щоб позначити
-- «Нове» біля пункту, треба знати, чи людина його вже бачила.
--
-- ЧОМУ ПАМ'ЯТЬ, А НЕ АРХЕОЛОГІЯ ПО ЖУРНАЛУ. Можна було б шукати в audit_log,
-- коли саме людині відкрили модуль. Але журнал глибокий, а відповідь потрібна
-- на кожен рендер меню. Пам'ять простіша й точніша: пункт, якого в списку
-- немає, — новий, байдуже чому (модуль щойно з'явився чи доступ щойно дали).
--
-- ЧОМУ В БАЗІ, А НЕ В БРАУЗЕРІ. localStorage прив'язаний до пристрою: людина
-- відкриває CRM з телефона — і все меню підсвічене як нове.
--
-- Рядок належить самій людині: читає й пише вона сама, більше ніхто. Це не
-- секрет, але й нікому не потрібно — команді байдуже, які пункти ти вже бачив.
--
-- Безпечно застосовувати повторно.

create table if not exists tosho.member_seen_modules (
  workspace_id uuid not null,
  user_id uuid not null,
  module_key text not null,
  seen_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, user_id, module_key)
);

create index if not exists member_seen_modules_user_idx
  on tosho.member_seen_modules (workspace_id, user_id);

alter table tosho.member_seen_modules enable row level security;

drop policy if exists "member_seen_modules_own" on tosho.member_seen_modules;
create policy "member_seen_modules_own"
on tosho.member_seen_modules
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on tosho.member_seen_modules from anon;
grant select, insert, update, delete on tosho.member_seen_modules to authenticated;

notify pgrst, 'reload schema';
