-- Власні розміри коробок команди для форми ТТН.
--
-- Каталог пакування НП (Common.getPackList) — це те, що вони ПРОДАЮТЬ у відділенні:
-- скотч, плівка, наповнювач і сотні позицій. Ми пакуємо у свої й постачальницькі
-- короби, тож той каталог нам не джерело. Тримаємо власний короткий список.
--
-- Формат: [{ "label": "Мала", "length": 40, "width": 30, "height": 26 }, ...]
-- Сторони — у сантиметрах, як їх чекає OptionsSeat у НП.

alter table tosho.nova_poshta_settings
  add column if not exists box_sizes jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
