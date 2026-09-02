import { assertCronAuthorized } from "./_cronAuth";
import {
  setTelegramCommands,
  setTelegramDescription,
  setTelegramMenuButtonToCommands,
  setTelegramShortDescription,
} from "./_telegram";

// Одноразове налаштування бота: список команд + режим кнопки «Меню».
//
// Саме `setMyCommands` вмикає нативну кнопку «Меню» біля поля введення —
// без зареєстрованих команд Telegram її не показує взагалі. Це налаштування
// бота, а не користувача, тож достатньо викликати один раз (і повторювати
// після зміни набору команд).
//
// Запуск: POST /.netlify/functions/telegram-setup з заголовком x-cron-key.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

// Порядок = порядок у меню Telegram.
// Меню команд — короткий службовий список. Дії з відсутностями — у плитках
// «Швидких дій» (/menu); самі команди /absence і /away при цьому ПРАЦЮЮТЬ,
// якщо їх набрати руками, — вони просто не муляють у цьому списку.
//
// Команди в списку — ЛИШЕ латиницею: Bot API приймає тут тільки [a-z0-9_], і
// кирилиця валить увесь виклик setMyCommands.
const COMMANDS = [
  { command: "menu", description: "Швидкі дії" },
  // «queue», а не «черга»: у списку команд кирилиця заборонена (див. вище).
  // Обидві форми працюють, у меню видно латинську.
  //
  // У списку її бачать УСІ, хоч відкривається вона лише керівництву: Bot API
  // уміє показувати різні набори команд різним чатам (scope), але це окремий
  // виклик setMyCommands на кожну людину й окремий обов'язок тримати його в
  // синхроні. Ціна теперішнього рішення — ввічлива відмова тому, хто натисне;
  // ціна «правильного» — механізм, який тихо розсинхронізується.
  { command: "queue", description: "Черга запитів на доробку (керівництво)" },
  { command: "help", description: "Що можна питати" },
  { command: "settings", description: "Які сповіщення слати" },
  { command: "stop", description: "Відписатись від сповіщень" },
];

// Порожній екран чату — перше, що бачить людина ДО натискання Start.
// Ліміти Bot API: description 512, short_description 120.
const DESCRIPTION =
  "Сповіщення ToSho CRM і швидкі відповіді про задачі, прорахунки й команду — просто напиши питання. " +
  "Відсутності без відкриття CRM: «хворію» чи /absence — лікарняний або заявка, /away — хто сьогодні відсутній.";

const SHORT_DESCRIPTION = "Бот ToSho CRM — сповіщення, відповіді, відсутності.";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  if (!process.env.CRON_SHARED_SECRET) return json(503, { error: "CRON_SHARED_SECRET is not configured" });
  const denial = assertCronAuthorized(event);
  if (denial) return denial;

  const commands = await setTelegramCommands(COMMANDS);
  const menuButton = await setTelegramMenuButtonToCommands();
  const description = await setTelegramDescription(DESCRIPTION);
  const shortDescription = await setTelegramShortDescription(SHORT_DESCRIPTION);

  const ok = commands.ok && menuButton.ok && description.ok && shortDescription.ok;
  return json(ok ? 200 : 502, {
    ok,
    commands: { ok: commands.ok, description: commands.description },
    menuButton: { ok: menuButton.ok, description: menuButton.description },
    description: { ok: description.ok, description: description.description },
    shortDescription: { ok: shortDescription.ok, description: shortDescription.description },
    registered: COMMANDS.map((c) => `/${c.command}`),
  });
};
