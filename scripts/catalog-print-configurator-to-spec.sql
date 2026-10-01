-- Пакет, блокнот і блоки для записів — з конфігуратора на опис полів (REQ-323#p4).
--
-- Три моделі каталогу вказували на старий механізм ключем configuratorPreset.
-- На ньому параметри заповнювались лише раз, у вікні створення, а на картці
-- прорахунку тільки читались: без стовпчиків, без підсвічення змін після ціни,
-- без версій. Нове вікно створення таких моделей не показує взагалі — рейка
-- поліграфії бере лише моделі зі specPreset.
--
-- Ключі пресетів ті самі (print_package, print_notebook, print_note_blocks):
-- описи під ними тепер у src/lib/printSpecPresets.ts. Тож скрипт лише переносить
-- значення з одного ключа metadata в інший і гасить старий — щоб модель не мала
-- двох наборів полів одночасно.
--
-- Позиції прорахунків тут НЕ чіпаються: старий metadata.printProduct застосунок
-- перекладає на опис полів при читанні (src/lib/printSpecLegacy.ts).
--
-- Ідемпотентний: другий запуск не знайде жодної моделі з цими configuratorPreset.

\set ON_ERROR_STOP on

begin;

update tosho.catalog_models
set metadata = (metadata - 'configuratorPreset')
      || jsonb_build_object('specPreset', metadata ->> 'configuratorPreset'),
    updated_at = now()
where metadata ->> 'configuratorPreset' in ('print_package', 'print_notebook', 'print_note_blocks');

select
  t.name as tip,
  k.name as vyd,
  m.name as model,
  coalesce(m.metadata ->> 'specPreset', '—') as spec_preset,
  coalesce(m.metadata ->> 'configuratorPreset', '—') as configurator_preset
from tosho.catalog_models m
join tosho.catalog_kinds k on k.id = m.kind_id
join tosho.catalog_types t on t.id = k.type_id
where t.quote_type = 'print'
order by t.name, k.name, m.name;

commit;
