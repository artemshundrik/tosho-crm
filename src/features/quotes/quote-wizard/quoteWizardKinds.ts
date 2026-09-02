import { FileSpreadsheet, Link2, Package, PencilLine, Printer, Shirt } from "lucide-react";

/**
 * Словник вікна «Новий прорахунок» (REQ-237): що рахуємо і звідки позиції.
 *
 * Типи виробу лишились ті самі, що в першому екрані REQ-134; джерел стало
 * три — до «руками» й «Excel» додалось «за посиланням». Тримається окремо від
 * розмітки, бо ці значення читає й сторінка прорахунків (`quote_type`).
 */

export type QuoteKindValue = "print" | "merch" | "other";

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
    label: "Мерч",
    hint: "Одяг, аксесуари, сувеніри з нанесенням",
    icon: Shirt,
    tone: "bg-muted text-muted-foreground",
  },
  {
    value: "other",
    label: "Інше",
    hint: "Усе, що не лягло в перші дві",
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
