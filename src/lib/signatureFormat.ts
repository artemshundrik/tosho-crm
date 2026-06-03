// Convert a Ukrainian full name "Прізвище Імʼя По-батькові" to signature initials "І.П. Прізвище".
// Examples:
//   "Андрущак Вадим Іванович" → "В.І. Андрущак"
//   "Борщ Олена Вікторівна"   → "О.В. Борщ"
//   "Іваненко Іван"            → "І. Іваненко"
//   "Іваненко"                 → "Іваненко"
//   "Баранов Є.О."            → "Є.О. Баранов"   (вже-готові ініціали зберігаємо повністю)
//   "Баранов Є. О."          → "Є.О. Баранов"
// Used in document signature lines (Договір, СП).

export const toSignatureInitials = (fullName?: string | null): string => {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const [last, ...rest] = parts;
  // Якщо після прізвища вже стоять ініціали (містять крапку, напр. "Є.О." чи "Є. О."),
  // не обрізаємо їх до однієї літери — зберігаємо повністю, лише ставимо перед прізвищем.
  if (rest.some((token) => token.includes("."))) {
    const initials = rest.join("").replace(/\s+/g, "");
    return `${initials} ${last}`;
  }
  // Повні слова імені/по-батькові → абревіатура "І.П.".
  const [first, middle] = rest;
  const firstInitial = first ? `${first.charAt(0).toLocaleUpperCase("uk-UA")}.` : "";
  const middleInitial = middle ? `${middle.charAt(0).toLocaleUpperCase("uk-UA")}.` : "";
  const initials = `${firstInitial}${middleInitial}`;
  return initials ? `${initials} ${last}` : last;
};
