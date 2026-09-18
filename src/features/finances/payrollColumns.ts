import type { PayrollFrameColumn, PayrollFrameGroup } from "./PayrollTableFrame";

/**
 * Опис колонок відомості «Виплати команді» — один на таблицю і на її скелетон.
 *
 * Скелетон малюється тим самим PayrollTableFrame з тими ж ширинами, тож повторити
 * розкладку «на око» неможливо в принципі: колонка може змінитись лише тут, і
 * змінюється одразу в обох. Заголовки в скелетоні справжні, не сірі смужки —
 * вони не залежать від даних, тож коли дані приходять, нічого не стрибає.
 *
 * `cell` каже, чим заповнити клітинку в скелетоні: поле вводу, число, тощо.
 *
 * ШИРИНИ — В ПІКСЕЛЯХ, і сума їх зобов'язує (REQ-284). «Підсумок» притиснутий
 * до правого краю через `sticky` + `right: N`, де N — сума ширин колонок
 * правіше: статус 64 → нотатка right-[64px] → «Загальна» right-[96px] →
 * «До виплати» right-[192px]. Зміниш ширину — перерахуй зсуви лівіше від неї;
 * перевірка в payrollColumns.test.ts не дасть їм розійтись.
 *
 * Підсумок — впритул до вмісту, бо він притиснутий і кожен його піксель
 * забирає місце в середини, що їде під прокрутку. Заміряно в браузері
 * 18.09.2026 (відступи клітинки 8+8): «До виплати» тримає підпис у шапці —
 * «ДО ВИПЛАТИ» 84px → 100; «Загальна» — найдовше число, «220 097,50» 79px → 96.
 * Було 112 і 108, і між двома стовпчиками чисел стояло по 25px порожнечі.
 *
 * «Співробітник» — єдина без ширини: у fixed-розкладці саме вона забирає всю
 * зайву ширину на широкій панелі, а на мінімальній (1306) лишається 142px —
 * аватар 24, ім'я, посада під ним. Це на чверть вужче за колишні 15% (≈188):
 * замір показав, що під найдовшу посаду («Начальник відділу логістики»)
 * треба ~150px на 11px, і решта стояла повітрям перед «Ставкою».
 *
 * Середина — вісім колонок з полями. Найвужче поле мусить вмістити «1 490,13»
 * (12px, tabular): 51px тексту + 20 відступів поля + 16 відступів клітинки = 87
 * → 92. «АЗП» і «Аванс» ще несуть чип дати (52px зліва) → 136. Разом 872.
 *
 * «Нотатка» — колонка-позначка на 22px: нотатка буває в однієї-двох людей із
 * сімнадцяти, текст живе в попапі. «Статус» — перемикач на 36px; колонку
 * тримає не він, а підпис у шапці: «СТАТУС» на 11px з трекінгом — 48px, плюс
 * відступи по 8 — 64. На 50 останню літеру зрізало (перевірено в прев'ю).
 */
export type PayrollCell = "person" | "input" | "amount" | "note" | "status";
export type PayrollColumn = PayrollFrameColumn & { cell: PayrollCell };

export const PAYROLL_COLUMNS: readonly PayrollColumn[] = [
  { key: "person", label: "Співробітник", width: "", align: "", cell: "person", frozen: "left" },
  // Нараховано
  { key: "base", label: "Ставка", width: "w-[96px]", align: "", cell: "input" },
  { key: "bonus", label: "Бонус", width: "w-[96px]", align: "", cell: "input" },
  // Утримано. Штраф стоїть одразу за бонусом: це його дзеркало, і поруч їх видно парою.
  { key: "penalty", label: "Штраф", width: "w-[92px]", align: "", cell: "input" },
  {
    key: "personalOrder",
    label: "Особисте замовлення",
    short: "Особисте",
    sub: "замовлення",
    width: "w-[112px]",
    align: "",
    cell: "input",
  },
  // Офіційно, через банк
  { key: "official", label: "Офіційна ЗП", short: "Офіц. ЗП", width: "w-[100px]", align: "", cell: "input" },
  {
    key: "officialAdvance",
    label: "Офіційний аванс (АЗП)",
    short: "АЗП",
    sub: "офіц. аванс",
    width: "w-[136px]",
    align: "",
    cell: "input",
  },
  {
    key: "officialTax",
    label: "Офіційні податки",
    short: "Податки",
    sub: "офіційні",
    width: "w-[104px]",
    align: "",
    cell: "input",
  },
  // Готівка
  { key: "advance", label: "Аванс готівкою", short: "Аванс", sub: "готівкою", width: "w-[136px]", align: "", cell: "input" },
  // Підсумок — притиснутий праворуч
  {
    key: "total",
    label: "До виплати",
    width: "w-[100px]",
    align: "text-right",
    cell: "amount",
    frozen: "right",
    offset: "right-[192px]",
    edge: true,
  },
  {
    key: "earned",
    label: "Загальна ЗП за місяць",
    short: "Загальна",
    sub: "ЗП за місяць",
    width: "w-[96px]",
    align: "text-right",
    cell: "amount",
    frozen: "right",
    offset: "right-[96px]",
  },
  {
    key: "note",
    label: "Нотатка",
    width: "w-[32px]",
    align: "text-center",
    cell: "note",
    srOnly: true,
    frozen: "right",
    offset: "right-[64px]",
  },
  {
    key: "status",
    label: "Статус",
    width: "w-[64px]",
    align: "text-center",
    cell: "status",
    frozen: "right",
    offset: "right-0",
  },
];

/**
 * Рядок груп над колонками — щоб тринадцять заголовків читались п'ятьма
 * словами. Порядок і `span` мусять збігатися з PAYROLL_COLUMNS після
 * «Співробітника»; це теж стереже payrollColumns.test.ts.
 */
export const PAYROLL_GROUPS: readonly PayrollFrameGroup[] = [
  { key: "accrued", label: "Нараховано", span: 2 },
  { key: "withheld", label: "Утримано", span: 2 },
  { key: "official", label: "Офіційно · через банк", span: 3 },
  { key: "cash", label: "Готівка", span: 1 },
  { key: "summary", label: "Підсумок", span: 4, frozen: "right" },
];
