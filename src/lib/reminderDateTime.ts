/**
 * Нагадування зберігаються СПРАВЖНІМ UTC-моментом: питання тут «коли надіслати»,
 * а не «яку годину пообіцяли». Запис і читання симетричні — toISOString() туди,
 * локальні поля назад.
 *
 * Це НЕ та сама конвенція, що в дедлайнів прорахунку (там настінний час).
 * Обидві описані в docs/DATETIME.md; плутати їх дорого.
 */
function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function buildReminderAtIso(date: string, time: string) {
  const normalizedDate = date.trim();
  const normalizedTime = time.trim();
  if (!normalizedDate || !normalizedTime) return null;

  const localDate = new Date(`${normalizedDate}T${normalizedTime}:00`);
  if (Number.isNaN(localDate.getTime())) return null;

  return localDate.toISOString();
}

export function getLocalReminderDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

export function getLocalReminderTimeInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}
