/**
 * Catalog Constants
 * 
 * This file contains all constant values used throughout the catalog system.
 */

import type { CatalogType } from "@/types/catalog";

/**
 * Initial empty catalog state
 */
export const INITIAL_CATALOG: CatalogType[] = [];

/**
 * Currency symbol used throughout the catalog
 */
export const CURRENCY_SYMBOL = "₴";

/**
 * Default price value
 */
export const DEFAULT_PRICE = 0;

/**
 * Default minimum quantity for price tiers
 */
export const DEFAULT_MIN_QUANTITY = 1;

/**
 * Quote type labels for UI display
 */
export const QUOTE_TYPE_LABELS = {
  merch: "Мерч",
  print: "Поліграфія",
  other: "Інше",
} as const;

/**
 * Validation error messages
 */
export const VALIDATION_MESSAGES = {
  NAME_REQUIRED: "Відсутня назва моделі",
  NO_METHODS: "Не вибрано жодного методу",
  INVALID_PRICE_TIERS: "Ціни тиражів повинні зменшуватись",
} as const;

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  TEAM_ID: "tosho.teamId",
} as const;

/**
 * CSV export configuration
 */
export const CSV_CONFIG = {
  HEADERS: ['Тип', 'Вид', 'Модель', 'Ціна від', 'Ціна до', 'Методи', 'Фото URL'],
  BOM: '\ufeff', // UTF-8 BOM for Excel compatibility
  MIME_TYPE: 'text/csv;charset=utf-8;',
  FILE_PREFIX: 'catalog_',
} as const;
