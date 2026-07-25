import { assertCronAuthorized } from "./_cronAuth";
import { setTelegramCommands, setTelegramMenuButtonToCommands } from "./_telegram";

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
const COMMANDS = [
  { command: "menu", description: "Швидкі питання" },
  { command: "help", description: "Що можна питати" },
  { command: "settings", description: "Які сповіщення слати" },
  { command: "stop", description: "Відписатись від сповіщень" },
];

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

  const ok = commands.ok && menuButton.ok;
  return json(ok ? 200 : 502, {
    ok,
    commands: { ok: commands.ok, description: commands.description },
    menuButton: { ok: menuButton.ok, description: menuButton.description },
    registered: COMMANDS.map((c) => `/${c.command}`),
  });
};
