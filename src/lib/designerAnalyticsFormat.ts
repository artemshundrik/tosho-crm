/**
 * Спільні формати чисел/дат для аналітики дизайнерів.
 *
 * Живуть окремо, бо їх ділять екранний дашборд (DesignersDashboard) і друкований
 * звіт (DesignersPrintReport) — інакше формати довелося б дублювати, і два
 * представлення одних і тих самих даних могли б розійтися в округленнях.
 */

/** Години:хвилини — для колонок, де числа мають вирівнюватись (1:05). */
export const formatHM = (seconds: number) => {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
};

/** Людський запис тривалості: «45 хв», «2 год», «1 год 20 хв». */
export const formatHumanMinutes = (totalMinutesRaw: number) => {
  const totalMinutes = Math.round(totalMinutesRaw);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} хв`;
  if (minutes === 0) return `${hours} год`;
  return `${hours} год ${minutes} хв`;
};

export const formatHumanSeconds = (seconds: number) => formatHumanMinutes(seconds / 60);

/** Цілі години — для «Годин у таймері». */
export const formatHours = (seconds: number) => `${Math.round(seconds / 3600)}`;

/** «Липень 2026» з ключа місяця "2026-07". */
export const monthTitle = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  const label = date.toLocaleDateString("uk-UA", { month: "long", timeZone: "UTC" });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${year}`;
};

/** «лип» з ключа місяця "2026-07". */
export const monthShort = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  return date.toLocaleDateString("uk-UA", { month: "short", timeZone: "UTC" }).replace(".", "");
};

export const getInitials = (name?: string | null) => {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "•";
};

export const firstName = (label: string) => label.trim().split(/\s+/)[0] || label;
