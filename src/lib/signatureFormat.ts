// Convert a Ukrainian full name "Прізвище Імʼя По-батькові" to signature initials "І.П. Прізвище".
// Examples:
//   "Андрущак Вадим Іванович" → "В.І. Андрущак"
//   "Борщ Олена Вікторівна"   → "О.В. Борщ"
//   "Іваненко Іван"            → "І. Іваненко"
//   "Іваненко"                 → "Іваненко"
// Used in document signature lines (Договір, СП).

export const toSignatureInitials = (fullName?: string | null): string => {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const [last, first, middle] = parts;
  const firstInitial = first ? `${first.charAt(0).toLocaleUpperCase("uk-UA")}.` : "";
  const middleInitial = middle ? `${middle.charAt(0).toLocaleUpperCase("uk-UA")}.` : "";
  const initials = `${firstInitial}${middleInitial}`;
  return initials ? `${initials} ${last}` : last;
};
