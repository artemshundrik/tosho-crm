import { FileSpreadsheet, Link2, Package, PencilLine, Printer } from "lucide-react";

/**
 * Словник вікна «Новий прорахунок» (REQ-237): що рахуємо і звідки позиції.
 *
 * Типів виробу ДВА, не три (REQ-182, 04.09.2026). «Інше» прибрано: заміри
 * проду показали, що це був не вибір людини, а дефолт при заведенні категорії
 * каталогу — там осіли 16 із 29 типів, зокрема Агро й Туризм. Менеджери тікали
 * туди від слова «мерч»: усі 20 агро-позицій пішли в «Інше», хоч «Мерч» був
 * поруч, бо каска будівельника й опадомір мерчем не звучать. Тому друга
 * відповідь тепер «Товар» — слово, яке покриває всі 29 категорій і вже
 * вживалось у CRM (`DesignTaskProductCard`).
 *
 * Значення `merch` у базі лишилось те саме: перейменовано ПІДПИС, не дані.
 * `other` теж лишився в `QuoteType` — під ним 78 старих прорахунків, які мають
 * далі знаходитись у фільтрах.
 */

export type QuoteKindValue = "print" | "merch";

/** Звідки беруться позиції: людина вводить їх руками, з файлу або зі сторінки товару. */
export type QuoteSourceValue = "manual" | "excel" | "link";

export type QuoteKindOption = {
  value: QuoteKindValue;
  label: string;
  hint: string;
  icon: typeof Printer;
  /**
   * Тон плитки з піктограмою. Монохромний навмисно (02.09.2026): кольорові
   * квадратики читались як статуси, хоч це просто категорії. Колір у картці
   * прорахунку означає стан, і три різні тони поруч із синьою обводкою вибору
   * робили з вікна вітрину.
   */
  tone: string;
};

export const QUOTE_KINDS: QuoteKindOption[] = [
  {
    value: "print",
    label: "Поліграфія",
    hint: "Щоденники, каталоги, блокноти, пакування",
    icon: Printer,
    tone: "bg-muted text-muted-foreground",
  },
  {
    value: "merch",
    label: "Товар",
    hint: "Усе, що купуємо готовим і брендуємо",
    icon: Package,
    tone: "bg-muted text-muted-foreground",
  },
];

export type QuoteSourceOption = {
  value: QuoteSourceValue;
  /** Одне-два слова: підпис живе в сегментованому перемикачі, а не на плитці. */
  label: string;
  hint: string;
  icon: typeof PencilLine;
  /** Джерело, де працює модель або розвідка сайту — позначається окремо. */
  assisted: boolean;
};

export const QUOTE_SOURCES: QuoteSourceOption[] = [
  { value: "manual", label: "Руками", hint: "Одна-дві позиції, знаю що", icon: PencilLine, assisted: false },
  { value: "excel", label: "Excel", hint: "Запит від клієнта таблицею", icon: FileSpreadsheet, assisted: true },
  { value: "link", label: "Посилання", hint: "Товар у постачальника", icon: Link2, assisted: true },
];
