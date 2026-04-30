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
