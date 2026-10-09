/**
 * Підпис валюти для ока, а не для машини.
 *
 * У полях і сумах прорахунку стояв код ISO — «UAH». Це абревіатура з чужої
 * мови посеред українського інтерфейсу, і поруч із «шт.» та «%» вона читалась
 * як щось іншого роду. Гривня пишеться «грн»; решта валют лишається кодом, бо
 * власного усталеного скорочення в українській вони не мають.
 */
export function currencyLabel(currency?: string | null): string {
  const code = (currency ?? "UAH").trim().toUpperCase();
  return code === "UAH" ? "грн" : code || "грн";
}

/**
 * Гроші на картці прорахунку.
 *
 * ДВА ЗНАКИ ПІСЛЯ КОМИ, А НЕ ТРИ. `toLocaleString("uk-UA")` без опцій дає до
 * трьох знаків — і ціна 46,0222 ₴ малювалась як «46,022». Поруч у тій самій
 * картці стоять «4 644» і «8 284», де пробіл — розділювач тисяч, тож око
 * читало сорок шість тисяч за товар собівартістю 25,80 ₴ (скарга менеджера
 * 25.08.2026). Копійки — це два знаки, третього в грошах не буває.
 *
 * Ціле число лишається без «,00»: більшість сум тут цілі, і хвіст із нулів
 * додав би шуму там, де його не було.
 *
 * Живе тут, а не в quote-details/config.tsx (звідки реекспортується), бо його
 * читає й серверна функція нагадувань (REQ-328): config.tsx тягне значки й
 * розмітку, а сума в Telegram має бути тією самою, що на картці.
 */
export function formatCurrency(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined) return "Не вказано";
  const label = currencyLabel(currency);
  // `|| 0` прибирає мінус нуля: −0,004 округлюється до −0, і на екрані
  // з'являлось «-0 UAH» — число, якого не буває.
  const rounded = Math.round(value * 100) / 100 || 0;
  const fractionDigits = Number.isInteger(rounded) ? 0 : 2;
  return `${rounded.toLocaleString("uk-UA", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ${label}`;
}
