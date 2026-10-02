-- ОБГОВОРЕННЯ ПРОРАХУНКУ НЕ БЛОКУЄТЬСЯ ЧУЖИМ РЕДАГУВАННЯМ (02.10.2026)
--
-- ЩО БУЛО. На `tosho.quote_comments` висів той самий замок, що й на цінах:
-- тригер `trg_quote_lock_quote_comments` → `assert_quote_lock_from_quote_id()`
-- падав з «Quote is locked by another user», поки прорахунок відкритий у
-- когось іншого. Тобто поки керівник сидить у прорахунку, проєктний менеджер
-- не міг навіть написати йому в «Обговоренні» — рівно тоді, коли написати
-- найпотрібніше. Гочу знайшли ще під час чату задач (docs/TASK_CHAT_DESIGN.md,
-- §5) і лишили «на рішення CEO». Рішення: писати можна завжди.
--
-- ЧОМУ ЦЕ БЕЗПЕЧНО. Замок редагування захищає від втраченого оновлення: двоє
-- правлять одне поле, і хтось затирає чуже. Повідомлення в обговоренні нічого
-- чужого не перезаписує — кожне окремий рядок свого автора. Права на запис
-- лишаються там, де й були: RLS `quote_comments` цей скрипт не чіпає.
--
-- ФАЙЛИ. Файл, прикріплений до повідомлення, лягає в `tosho.quote_attachments`
-- («Файли справи»), і там стоїть той самий замок. Без змін там повідомлення зі
-- скріншотом падало б далі. Тому з файлів знято лише ДОДАВАННЯ: новий файл теж
-- нічого не перезаписує. Змінити чи видалити чужий файл, поки прорахунок
-- відкритий у когось іншого, як і раніше не можна.
--
-- Ціни, позиції, тиражі, статус — без змін: там замок і є сенсом.

-- Без begin/commit: `npm run db:apply` сам загортає файл у транзакцію (psql -1).

drop trigger if exists trg_quote_lock_quote_comments on tosho.quote_comments;

drop trigger if exists trg_quote_lock_quote_attachments on tosho.quote_attachments;
create trigger trg_quote_lock_quote_attachments
  before update or delete on tosho.quote_attachments
  for each row execute function public.assert_quote_lock_from_quote_id();
