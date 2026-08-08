/**
 * Абсолютне посилання в CRM для кнопок і сповіщень.
 *
 * Той самий запасний хост, що в решті функцій (PUBLIC_APP_URL || tosho.pro);
 * винесено сюди, бо кнопку «Відкрити в CRM» тепер шлють двоє — вебхук і
 * background-функція запитів, — а два власні збирачі URL розійшлись би на
 * першому ж переїзді домену.
 */
export function buildAppUrl(path: string): string {
  const base = process.env.PUBLIC_APP_URL || "https://tosho.pro";
  try {
    return new URL(path, base).toString();
  } catch {
    return base;
  }
}
