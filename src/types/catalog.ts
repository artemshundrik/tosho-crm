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
  baseVariantName?: string | null;
  variants?: CatalogModelVariant[];
  configuratorPreset?: "print_package" | "print_notebook" | "print_note_blocks" | null;
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
