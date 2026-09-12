/**
 * Ескізи товару з областями нанесення — те, що показує вікно вибору місця.
 *
 * ЧОМУ ЧАСТКИ, А НЕ ПІКСЕЛІ. Обидва боки одного виду лежать на полотні того
 * самого розміру й у тому самому масштабі (так їх ріже
 * `scripts/prep-imprint-asset.py`), тож зона описується часткою полотна й
 * лишається на місці за будь-якого показу — 240 px у чипі чи 420 px у вікні.
 *
 * ЧОМУ ПІДПИСИ ЗОН ЗБІГАЮТЬСЯ З ДОВІДНИКОМ. `resolveImprintPlaces`
 * (`imprintPlaces.ts`) шукає рядок `catalog_print_positions` за підписом без
 * регістру й заводить новий, якщо не знайшов. Отже «Груди» тут мусить бути
 * тим самим словом, що в довіднику, інакше на кожен клік з'явиться дубль
 * рядка, а 69 наявних нанесень «Груди» осиротіють.
 *
 * ЛІВИЙ І ПРАВИЙ РУКАВ — ЗА ВЛАСНИКОМ, НЕ ЗА ГЛЯДАЧЕМ. На вигляді спереду
 * рукав, що ліворуч на екрані, вдягнений на ПРАВУ руку. Так читають тех-пак
 * дизайнери, і так підписані два наявні рядки довідника.
 *
 * РОЗМІР — ОДИН НА ВИД, А НЕ НА ЗОНУ. У базі виміряний середній розмір
 * нанесення по виду (футболка — 139×144 мм на 37 нанесеннях за пів року), а
 * не по кожному місцю окремо: на рукави й комір таких замірів просто немає.
 * Тому підпис стоїть біля виду й чесно каже «типово», а не вигадує число
 * для кожної рамки.
 */

export type ImprintViewId = "front" | "back";

export type ImprintView = {
  id: ImprintViewId;
  /** Підпис перемикача боків. */
  label: string;
  /** Шлях у `public/` — картинку не бандлимо, вона вантажиться лише з вікном. */
  src: string;
};

export type ImprintZone = {
  id: string;
  view: ImprintViewId;
  /** Слово в довідник місць. Мусить збігатися з `catalog_print_positions.label`. */
  label: string;
  /** Частки полотна ескізу, 0..1: лівий край, верх, ширина, висота. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ImprintSheet = {
  /** Нормалізована назва виду (нижній регістр) — ключ пошуку. */
  kind: string;
  views: ImprintView[];
  zones: ImprintZone[];
  /** Типовий розмір нанесення цього виду, мм. `null` — замірів немає. */
  typicalMm: readonly [number, number] | null;
};

const TEE: ImprintSheet = {
  kind: "футболка",
  views: [
    { id: "front", label: "Спереду", src: "/imprint/tee-front.webp" },
    { id: "back", label: "Ззаду", src: "/imprint/tee-back.webp" },
  ],
  zones: [
    { id: "tee-chest", view: "front", label: "Груди", x: 0.342, y: 0.33, w: 0.34, h: 0.285 },
    { id: "tee-sleeve-r", view: "front", label: "Правий рукав", x: 0.148, y: 0.24, w: 0.1, h: 0.08 },
    { id: "tee-sleeve-l", view: "front", label: "Лівий рукав", x: 0.752, y: 0.24, w: 0.1, h: 0.08 },
    { id: "tee-back", view: "back", label: "Спина", x: 0.33, y: 0.215, w: 0.34, h: 0.4 },
    { id: "tee-nape", view: "back", label: "Під коміром", x: 0.44, y: 0.112, w: 0.12, h: 0.042 },
  ],
  typicalMm: [139, 144],
};

const SHEETS: readonly ImprintSheet[] = [TEE];

/**
 * Ескіз виду за його назвою з каталогу.
 *
 * Ключ — НАЗВА, а не `kind_id`: ідентифікатори видів у кожної команди свої, а
 * назва «Футболка» спільна. Виду без ескізу тут просто немає — вікно тоді
 * лишається списком місць, як сьогодні, і нічого не ламається.
 */
export function getImprintSheet(kindName: string | null | undefined): ImprintSheet | null {
  const key = (kindName ?? "").trim().toLowerCase();
  if (!key) return null;
  return SHEETS.find((sheet) => sheet.kind === key) ?? null;
}

/** Зони одного боку, у порядку опису. */
export function zonesOfView(sheet: ImprintSheet, view: ImprintViewId): ImprintZone[] {
  return sheet.zones.filter((zone) => zone.view === view);
}

/** Бік, на якому лежить зона з таким підписом. Потрібно, щоб відкрити той бік. */
export function viewOfLabel(sheet: ImprintSheet, label: string | null | undefined): ImprintViewId | null {
  const key = (label ?? "").trim().toLowerCase();
  if (!key) return null;
  return sheet.zones.find((zone) => zone.label.toLowerCase() === key)?.view ?? null;
}
