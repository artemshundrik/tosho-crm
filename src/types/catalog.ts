/**
 * Catalog Type Definitions
 * 
 * This file contains all type definitions for the product catalog system.
 * It includes types for models, methods, price tiers, categories, and validation.
 */

/**
 * Represents a printing/decoration method available for a product
 */
export type CatalogMethod = {
  id: string;
  name: string;
  price?: number;
  /**
   * Запис у спільному довіднику методів. Рядок `catalog_methods` — це «метод
   * доступний цьому виду», а назва живе в довіднику: перейменування одне на всю
   * CRM. `name` вище — її дзеркало, яке підтримує тригер у базі.
   */
  directoryId?: string | null;
};

/**
 * Метод нанесення в спільному довіднику компанії (`tosho.method_directory`).
 * Один запис на метод, скільки б видів товару його не використовували.
 */
export type MethodDirectoryEntry = {
  id: string;
  name: string;
  active: boolean;
  /** У скількох видах товару цей метод уже увімкнено — рахується на клієнті. */
  kindCount: number;
};

/**
 * Represents a price tier for quantity-based pricing
 */
export type CatalogPriceTier = {
  id: string;
  min: number;
  max: number | null;
  price: number;
};

/**
 * Represents a product model in the catalog
 */
export type CatalogModel = {
  id: string;
  name: string;
  price?: number;
  priceTiers?: CatalogPriceTier[];
  methodIds?: string[];
  imageUrl?: string;
  metadata?: CatalogModelMetadata;
};

export type CatalogImageAsset = {
  bucket: string;
  path: string;
  originalUrl?: string | null;
  previewUrl?: string | null;
  thumbUrl?: string | null;
};

export type CatalogModelMetadata = {
  sku?: string | null;
  /** Link to this product on the supplier's site (becomes a button in quotes). */
  supplierUrl?: string | null;
  /** Link to this product on our Avantprint site (becomes a button in quotes). */
  avantprintUrl?: string | null;
  baseVariantName?: string | null;
  variants?: CatalogModelVariant[];
  configuratorPreset?: "print_package" | "print_notebook" | "print_note_blocks" | "print_certificates" | null;
  /**
   * Пресет описового виду (`lib/printSpec.ts`). Окремий ключ від
   * `configuratorPreset`: ту union звужує десяток функцій старого механізму, і
   * нове значення в ній зламало б їх усі. Зіллються, коли старі пресети перейдуть
   * на опис полями.
   */
  specPreset?: string | null;
  imageAsset?: CatalogImageAsset | null;
  source?: {
    vendor?: string | null;
    url?: string | null;
    importedAt?: string | null;
  } | null;
  brand?: string | null;
  description?: string | null;
  specs?: Array<{ label: string; value: string }>;
  sizes?: string[];
};

export type CatalogModelVariant = {
  id: string;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  imageAsset?: CatalogImageAsset | null;
  active?: boolean;
};

/**
 * Represents a print position option for products
 */
export type CatalogPrintPosition = {
  id: string;
  label: string;
  sort_order?: number | null;
};

/**
 * Represents a product kind/subcategory
 */
export type CatalogKind = {
  id: string;
  name: string;
  modelCount: number;
  models: CatalogModel[];
  methods: CatalogMethod[];
  printPositions: CatalogPrintPosition[];
};

/**
 * Represents a product type/category
 */
export type CatalogType = {
  id: string;
  name: string;
  quote_type?: string | null;
  kinds: CatalogKind[];
};

/**
 * Extended model with context information for filtering and search
 */
export type ModelWithContext = {
  model: CatalogModel;
  typeId: string;
  typeName: string;
  kindId: string;
  kindName: string;
  methods: CatalogMethod[]; // Available methods for this kind
  validation: ValidationResult;
};

/**
 * Result of model validation
 */
export type ValidationResult = {
  isValid: boolean;
  warnings: string[];
};

/**
 * Pricing mode for model editor
 */
export type PriceMode = "fixed" | "tiers";

/**
 * Quote type options
 */
export type QuoteType = "merch" | "print" | "other";

/**
 * Category dialog mode
 */
export type CategoryMode = "type" | "kind";

/**
 * Image upload mode
 */
export type ImageUploadMode = "url" | "file";
