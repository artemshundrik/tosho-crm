const kyivDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kiev" });

/** Київський календарний день (yyyy-MM-dd) — база перевіряє дати оплат і отримання саме за ним. */
export const kyivDay = (daysAgo = 0) => kyivDayFormat.format(new Date(Date.now() - daysAgo * 86_400_000));

/** «2026-10-14» → «14.10». */
export const dayMonth = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
};
