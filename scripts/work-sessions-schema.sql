-- Робочі години за ритмом сесій Claude Code.
--
-- НАВІЩО ОКРЕМО ВІД РЕЛІЗІВ: оцінка за комітами бачить лише те, що закінчилось
-- комітом. Реальний випадок 7 серпня: за комітами ≈6 год від 11:58, а насправді
-- робота йшла з 08:50 — ранок пішов на розбір і планування й не лишив у git
-- жодного сліду. Сесії Claude мають позначку часу на кожному повідомленні, тож
-- ловлять і такий ранок.
--
-- ЦЕ НЕ ЗАМІНА, А ДРУГИЙ ПРИЛАД. Дві цифри НЕ додаються — це той самий час,
-- виміряний по-різному. На сторінці вони йдуть двома шарами однієї смуги.
--
-- ЧОГО ТУТ НЕМАЄ І ЧОМУ:
--   · токенів — на підписці вони не тарифікуються поштучно, і показувати
--     «витрачено N» означало б вигадувати вартість;
--   · днів до 20 травня — раніше Claude Code не було, і дірку в даних чесніше
--     показати порожньою, ніж домалювати нулями.
--
-- Джерело — локальні транскрипти ~/.claude/projects, тож завантажує їх скрипт
-- із машини (scripts/record-work-hours.mjs). Netlify до них доступу не має.

create table if not exists tosho.work_sessions (
  /** Київський календарний день, YYYY-MM-DD. Один рядок на добу. */
  day         date        primary key,
  /** Оцінка годин за ритмом повідомлень: пауза >30 хв рве сесію, +5 хв розігрів. */
  hours       numeric(5,2) not null,
  /**
   * Підходи як [{from, to}] у хвилинах доби за київським часом — той самий
   * формат, що й блоки сесій на сторінці релізів.
   */
  blocks      jsonb       not null default '[]'::jsonb,
  /** Звідки міряли. Поки лише claude_code, але поле лишає місце для інших. */
  source      text        not null default 'claude_code',
  updated_at  timestamptz not null default now()
);

alter table tosho.work_sessions enable row level security;

-- Той самий предикат, що на релізах: власник або SEO.
drop policy if exists work_sessions_privileged_read on tosho.work_sessions;
create policy work_sessions_privileged_read on tosho.work_sessions
  for select using (tosho.can_read_all_feature_adoption());

revoke all on tosho.work_sessions from anon;
grant select on tosho.work_sessions to authenticated;
