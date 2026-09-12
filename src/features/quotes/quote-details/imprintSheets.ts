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
    // Рукави виміряні по альфа-каналу самого ескізу: вони живуть між y 0.20 і
    // 0.455, а вбік тягнуться до 0.03 і 0.97. Поставлені на око вони з'їжджали
    // на плече й на тло — видно лише у вікні, не на кресленні.
    { id: "tee-sleeve-r", view: "front", label: "Правий рукав", x: 0.105, y: 0.293, w: 0.08, h: 0.075 },
    { id: "tee-sleeve-l", view: "front", label: "Лівий рукав", x: 0.815, y: 0.293, w: 0.08, h: 0.075 },
    { id: "tee-back", view: "back", label: "Спина", x: 0.33, y: 0.215, w: 0.34, h: 0.4 },
    { id: "tee-nape", view: "back", label: "Під коміром", x: 0.44, y: 0.112, w: 0.12, h: 0.042 },
  ],
  typicalMm: [139, 144],
};

/**
 * Горнятко. Два боки — це той самий циліндр, повернутий ручкою в інший бік,
 * тому «під праву руку» й «під ліву руку» це РІЗНІ місця, а не один вигляд
 * двічі: наносять на те, що бачить співрозмовник.
 *
 * «По колу» тут поки немає: на боковому вигляді напис обривається за формою,
 * і чесно показати його можна лише розгорткою, якої в цьому наборі ще нема.
 */
const MUG: ImprintSheet = {
  kind: "горнятко",
  views: [
    { id: "front", label: "Ручка праворуч", src: "/imprint/mug-front.webp" },
    { id: "back", label: "Ручка ліворуч", src: "/imprint/mug-back.webp" },
  ],
  zones: [
    { id: "mug-right", view: "front", label: "Під праву руку", x: 0.14, y: 0.36, w: 0.44, h: 0.26 },
    { id: "mug-left", view: "back", label: "Під ліву руку", x: 0.41, y: 0.36, w: 0.44, h: 0.26 },
  ],
  typicalMm: [77, 54],
};

const CAP: ImprintSheet = {
  kind: "кепка",
  views: [
    { id: "front", label: "Спереду", src: "/imprint/cap-front.webp" },
    { id: "back", label: "Ззаду", src: "/imprint/cap-back.webp" },
  ],
  zones: [
    { id: "cap-brow", view: "front", label: "Лоб", x: 0.34, y: 0.34, w: 0.32, h: 0.17 },
    { id: "cap-side", view: "front", label: "Збоку", x: 0.72, y: 0.4, w: 0.12, h: 0.12 },
    { id: "cap-back", view: "back", label: "Ззаду над застібкою", x: 0.36, y: 0.3, w: 0.28, h: 0.14 },
  ],
  typicalMm: [71, 46],
};

const POLO: ImprintSheet = {
  kind: "поло",
  views: [
    { id: "front", label: "Спереду", src: "/imprint/polo-front.webp" },
    { id: "back", label: "Ззаду", src: "/imprint/polo-back.webp" },
  ],
  zones: [
    { id: "polo-chest", view: "front", label: "Груди", x: 0.34, y: 0.36, w: 0.32, h: 0.24 },
    { id: "polo-sleeve-r", view: "front", label: "Правий рукав", x: 0.11, y: 0.3, w: 0.12, h: 0.11 },
    { id: "polo-sleeve-l", view: "front", label: "Лівий рукав", x: 0.77, y: 0.3, w: 0.12, h: 0.11 },
    { id: "polo-back", view: "back", label: "Спина", x: 0.33, y: 0.27, w: 0.34, h: 0.34 },
    { id: "polo-nape", view: "back", label: "Під коміром", x: 0.44, y: 0.15, w: 0.12, h: 0.05 },
  ],
  typicalMm: [117, 80],
};

/** Світшот: рукави довгі, тож зона рукава стоїть на передпліччі, а не біля плеча. */
const SWEATSHIRT: ImprintSheet = {
  kind: "світшот",
  views: [
    { id: "front", label: "Спереду", src: "/imprint/sweatshirt-front.webp" },
    { id: "back", label: "Ззаду", src: "/imprint/sweatshirt-back.webp" },
  ],
  zones: [
    { id: "sw-chest", view: "front", label: "Груди", x: 0.34, y: 0.33, w: 0.32, h: 0.24 },
    { id: "sw-sleeve-r", view: "front", label: "Правий рукав", x: 0.09, y: 0.53, w: 0.11, h: 0.1 },
    { id: "sw-sleeve-l", view: "front", label: "Лівий рукав", x: 0.8, y: 0.53, w: 0.11, h: 0.1 },
    { id: "sw-back", view: "back", label: "Спина", x: 0.33, y: 0.25, w: 0.34, h: 0.34 },
    { id: "sw-nape", view: "back", label: "Під коміром", x: 0.44, y: 0.13, w: 0.12, h: 0.05 },
  ],
  typicalMm: [80, 66],
};

const SHEETS: readonly ImprintSheet[] = [TEE, MUG, CAP, POLO, SWEATSHIRT];

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
