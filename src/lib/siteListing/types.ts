/**
 * Чернетка картки avanprint.ua для моделі постачальника (REQ-311#p5).
 * Спека: docs/superpowers/specs/2026-10-01-site-autolisting-design.md, розділи 4–5.
 *
 * Лежить у `tosho.site_listing_items.draft` як є. Пише фонова функція
 * `site-listing-draft-background`, читають черга в CRM і збирач файлу імпорту —
 * тому тип спільний для `src` і `netlify/functions`.
 *
 * ЦІНИ, КОЛЬОРИ, ФОТО Й АРТИКУЛИ РАХУЄ КОД. Мовна модель пише лише назву, опис,
 * характеристики, рядок «Тип нанесення» і (коли код не впорався) розділ.
 */

export type ColorSource = "neighbor" | "brand" | "exact" | "group" | "fallback";

export type DraftVariant = {
  /** Артикул кольору — як у постачальника, без нормалізації регістру. */
  article: string;
  /** Назва кольору на сайті (поле «Цвет»). */
  color: string;
  /** Звідки взялась назва — для підказки в черзі. */
  colorSource: ColorSource;
  /** Ціна на сайті, цілі гривні: `siteListingPrice(supplierPrice)`. */
  price: number;
  /** Роздріб постачальника, з якого рахувалась ціна. */
  supplierPrice: number;
  /** Фото кольору, лише https; перше — «Фото», решта — «Галерея». */
  images: string[];
};

/** Таблиця розмірів зі сторінки постачальника (для одягу; у фіді її немає). */
export type SizeTable = {
  sizes: string[];
  rows: Array<{ label: string; values: string[] }>;
};

export type SiteListingDraft = {
  version: 1;
  generatedAt: string;
  /** Ідентифікатор мовної моделі, що писала текст. */
  model: string;
  title: string;
  /** 2–3 речення, кожне окремим абзацом. */
  intro: string[];
  /** «Поставляється в N різних кольорах.» — рахує код, бо число він знає точно. */
  colorsSentence: string | null;
  /** «матеріал: поліестер» — без маркера, «• » додає збирач. */
  bullets: string[];
  sizeTable: SizeTable | null;
  /** «Рекомендоване прання …» — лише коли постачальник його дає. */
  care: string | null;
  /** Текстиль: збирач додає примітку про допуск ±5%. */
  textile: boolean;
  /** Рядок після «Тип нанесення:». */
  methods: string;
  /** Повний шлях розділу сайту або null — тоді його вибирають у CRM. */
  category: string | null;
  categorySource: "votes" | "model" | null;
  /** Перший — головний колір: його артикул стає «Родительский артикул». */
  variants: DraftVariant[];
  /** Опису в постачальника не було — текст складено з характеристик. */
  noSupplierDescription: boolean;
  warnings: string[];
};

/** Те, що повертає мовна модель (після перевірки `parseDraftModelOutput`). */
export type DraftModelOutput = {
  title: string;
  intro: string[];
  bullets: string[];
  methods: string;
  care: string | null;
  category: string | null;
};

/** Відповідь `tosho.site_listing_draft_context(p_item_id)`. */
export type DraftContext = {
  model: {
    name: string;
    vendor: string | null;
    category: string | null;
    section: string | null;
    url: string | null;
    description: string | null;
    params: Record<string, string>;
    methods: string | null;
    textile: boolean;
    sizes: string[];
  } | null;
  variants: Array<{
    article: string;
    color: string | null;
    exactColor: string | null;
    group: string | null;
    sitePrice: number | null;
    images: string[];
  }>;
  brandColors: Array<{ model: string; color: string; siteColor: string }>;
  categoryVotes: Array<{ path: string; votes: number }>;
  examples: Array<{
    supplierName: string;
    supplierDescription: string | null;
    params: Record<string, string>;
    siteName: string;
    siteDescription: string;
  }>;
  siteCategories: string[];
};
