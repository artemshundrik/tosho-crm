/**
 * Catalog Utility Functions
 * 
 * This file contains utility functions for catalog operations including
 * ID generation, validation, formatting, and data export.
 */

import type {
  CatalogModel,
  CatalogPriceTier,
  CatalogType,
  ValidationResult,
} from "@/types/catalog";
import { CSV_CONFIG, DEFAULT_PRICE, VALIDATION_MESSAGES } from "@/constants/catalog";

/**
 * Generates a unique local ID for temporary records
 * @returns A unique ID string based on timestamp and random number
 */
export function createLocalId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Normalizes a string for comparison (lowercase, trimmed)
 * @param value - The string to normalize
 * @returns Normalized string
 */
export function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Creates the next price tier based on previous tiers
 * @param prevTiers - Array of existing price tiers
 * @param basePrice - Base price for the new tier
 * @returns A new price tier object
 */
export function createNextTier(
  prevTiers: CatalogPriceTier[],
  basePrice: number
): CatalogPriceTier {
  const last = prevTiers[prevTiers.length - 1];
  const nextMin = last ? (last.max ? last.max + 1 : last.min + 1) : 1;
  return { id: createLocalId(), min: nextMin, max: null, price: basePrice };
}

/**
 * Gets the price range display string for a model
 * @param model - The catalog model
 * @returns Formatted price range string
 */
export function getPriceRange(model: CatalogModel): string {
  if (model.priceTiers && model.priceTiers.length > 0) {
    const prices = model.priceTiers.map((t) => t.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatPrice(min) : `${formatPrice(min)}—${formatPrice(max)}`;
  }
  return formatPrice(model.price ?? DEFAULT_PRICE);
}

/**
 * Formats a price value for display
 * @param value - The numeric price value
 * @returns Formatted price string
 */
export function formatPrice(value: number): string {
  return value.toLocaleString("uk-UA");
}

/**
 * Validates a catalog model and returns validation result
 * @param model - The model to validate
 * @returns Validation result with warnings
 */
export function validateModel(model: CatalogModel): ValidationResult {
  const warnings: string[] = [];

  if (!model.name.trim()) {
    warnings.push(VALIDATION_MESSAGES.NAME_REQUIRED);
  }

  if (!model.methodIds || model.methodIds.length === 0) {
    warnings.push(VALIDATION_MESSAGES.NO_METHODS);
  }

  if (model.priceTiers && model.priceTiers.length > 1) {
    for (let i = 1; i < model.priceTiers.length; i++) {
      if (model.priceTiers[i].price >= model.priceTiers[i - 1].price) {
        warnings.push(VALIDATION_MESSAGES.INVALID_PRICE_TIERS);
        break;
      }
    }
  }

  return { isValid: warnings.length === 0, warnings };
}

/**
 * Calculates the discount percentage for tiered pricing
 * @param model - The catalog model
 * @returns Discount percentage (0 if not applicable)
 */
export function calculateDiscount(model: CatalogModel): number {
  if (!model.priceTiers || model.priceTiers.length < 2) {
    return 0;
  }

  const firstPrice = model.priceTiers[0].price;
  const lastPrice = model.priceTiers[model.priceTiers.length - 1].price;

  if (firstPrice === 0) return 0;

  return Math.round((1 - lastPrice / firstPrice) * 100);
}

/**
 * Exports catalog data to CSV format
 * @param catalog - The full catalog to export
 */
export function exportToCSV(catalog: CatalogType[]): void {
  const rows: string[][] = [[...CSV_CONFIG.HEADERS]];

  catalog.forEach((type) => {
    type.kinds.forEach((kind) => {
      kind.models.forEach((model) => {
        const priceRange = getPriceRange(model);
        const methods =
          model.methodIds
            ?.map((id) => kind.methods.find((m) => m.id === id)?.name || id)
            .join(", ") || "";

        rows.push([
          type.name,
          kind.name,
          model.name,
          priceRange.split("—")[0] || priceRange,
          priceRange.split("—")[1] || priceRange,
          methods,
          model.imageUrl || "",
        ]);
      });
    });
  });

  const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  const blob = new Blob([CSV_CONFIG.BOM + csv], { type: CSV_CONFIG.MIME_TYPE });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${CSV_CONFIG.FILE_PREFIX}${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
}

/**
 * Reads an image file and converts it to base64 data URL
 * @param file - The image file to read
 * @returns Promise resolving to base64 data URL
 */
export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
