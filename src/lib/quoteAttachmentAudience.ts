/**
 * Кому адресований файл, прикріплений до прорахунку.
 *
 * `project` — матеріали замовника для проєктного менеджера: договір, розміри,
 * листування. Живуть у зоні «Файли», доступній завжди — навіть коли друку
 * немає й дизайн-задача не створюється.
 *
 * `design` — матеріали для дизайнера: те, що поклали саме в дизайн-блок разом
 * із ТЗ. Лише вони вмикають `has_files` у дизайн-задачі й потрапляють у
 * дизайнерський список за замовчуванням.
 *
 * Джерело правди — колонка `tosho.quote_attachments.audience`
 * (scripts/quote-attachments-audience.sql). Донедавна цю ознаку вгадували
 * з підрядка в `storage_path`; поки від неї залежав лише чип-фільтр, це було
 * прийнятно, а тепер від неї залежить видимість — і вгадувати вже не можна.
 */
export const QUOTE_ATTACHMENT_AUDIENCES = ["project", "design"] as const;

export type QuoteAttachmentAudience = (typeof QUOTE_ATTACHMENT_AUDIENCES)[number];

export const QUOTE_ATTACHMENT_AUDIENCE_LABELS: Record<QuoteAttachmentAudience, string> = {
  project: "Файли прорахунку",
  design: "Для дизайнера",
};

/**
 * Дефолт для читання, а не для запису. Рядки, створені до міграції, лишились
 * зі значенням `design`, бо дизайнер бачив їх усі, — тож невідоме значення
 * теж читаємо як `design`: так нічого не зникає з очей людини, яка вже
 * працює із задачею. Записуючи новий файл, значення передавай явно.
 */
export const normalizeQuoteAttachmentAudience = (
  value: string | null | undefined
): QuoteAttachmentAudience =>
  value === "project" || value === "design" ? value : "design";
