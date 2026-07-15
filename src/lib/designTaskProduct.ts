/**
 * Design-task product (товар) — a lightweight, snapshot-based product descriptor
 * that lives inside a standalone design task's activity_log metadata
 * (metadata.product). Unlike a linked-quote task — where product data is pulled
 * live from quote_items — a manually created "Візуалізація" task carries its own
 * catalog snapshot so the designer can see what to visualize and where the print
 * (набивка) goes, without a quote.
 *
 * Supplier links ride along from the catalog model's metadata exactly like a
 * quote item snapshots supplierUrl/avantprintUrl (QuoteDetailsPage.tsx).
 */

import type { DesignTaskType } from "@/lib/designTaskType";

export type DesignTaskProductSurface = {
  methodId: string | null;
  methodLabel: string | null;
  positionId: string | null;
  positionLabel: string | null;
};

/** Which kind of product the snapshot describes: apparel/merch or поліграфія. */
export type DesignTaskProductKind = "merch" | "print";

/** Simplified print-sides choice for поліграфія products. */
export type DesignTaskPrintSide = "one_side" | "two_sides";

export const DESIGN_TASK_PRINT_SIDE_LABELS: Record<DesignTaskPrintSide, string> = {
  one_side: "З одної сторони",
  two_sides: "З двох сторін",
};

export type DesignTaskProduct = {
  /** merch = apparel cascade + нанесення; print = поліграфія (що друкуєш + сторони). */
  productKind: DesignTaskProductKind;
  catalogTypeId: string | null;
  catalogKindId: string | null;
  catalogModelId: string | null;
  /** Chosen modification (variant) id, when the model has variants. */
  variantId: string | null;
  /** Variant label (колір/модифікація), snapshot at create time. */
  variantName: string | null;
  /** Article / SKU (variant SKU, falling back to model SKU). */
  sku: string | null;
  /** Resolved model label (incl. " · variant"), snapshot at create time. */
  name: string;
  imageUrl: string | null;
  supplierUrl: string | null;
  avantprintUrl: string | null;
  surfaces: DesignTaskProductSurface[];
  /** Print-sides — set only for поліграфія (productKind === "print"). */
  printSides: DesignTaskPrintSide | null;
};

/** Design-task types that surface a manual product section (merch or поліграфія). */
export const DESIGN_TASK_PRODUCT_TYPES: ReadonlySet<DesignTaskType> = new Set<DesignTaskType>([
  "visualization",
]);

export function designTaskTypeShowsProduct(type?: DesignTaskType | null): boolean {
  return type != null && DESIGN_TASK_PRODUCT_TYPES.has(type);
}

/** A blank product of the given kind — used to seed the picker / kind switch. */
export function createEmptyDesignTaskProduct(kind: DesignTaskProductKind): DesignTaskProduct {
  return {
    productKind: kind,
    catalogTypeId: null,
    catalogKindId: null,
    catalogModelId: null,
    variantId: null,
    variantName: null,
    sku: null,
    name: "",
    imageUrl: null,
    supplierUrl: null,
    avantprintUrl: null,
    printSides: kind === "print" ? "one_side" : null,
    surfaces: [],
  };
}

/** True when the product snapshot carries a meaningful selection worth saving. */
export function hasDesignTaskProductSelection(product: DesignTaskProduct | null): boolean {
  if (!product) return false;
  if (product.productKind === "print") return !!product.catalogTypeId || !!product.name.trim();
  return !!product.catalogModelId;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

/** Serialize to the snake_case JSON blob stored in activity_log.metadata.product. */
export function serializeDesignTaskProduct(product: DesignTaskProduct): Record<string, unknown> {
  return {
    product_kind: product.productKind,
    catalog_type_id: product.catalogTypeId,
    catalog_kind_id: product.catalogKindId,
    catalog_model_id: product.catalogModelId,
    variant_id: product.variantId,
    variant_name: product.variantName,
    sku: product.sku,
    name: product.name,
    image_url: product.imageUrl,
    supplier_url: product.supplierUrl,
    avantprint_url: product.avantprintUrl,
    print_sides: product.printSides,
    surfaces: product.surfaces.map((surface) => ({
      method_id: surface.methodId,
      method_label: surface.methodLabel,
      position_id: surface.positionId,
      position_label: surface.positionLabel,
    })),
  };
}

const asPrintSide = (value: unknown): DesignTaskPrintSide | null =>
  value === "one_side" || value === "two_sides" ? value : null;

/** Parse the metadata.product blob back into a typed value; null when absent/empty. */
export function parseDesignTaskProduct(raw: unknown): DesignTaskProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const modelId = asString(record.catalog_model_id);
  const name = asString(record.name);
  // A meaningful product needs at least a model or a name.
  if (!modelId && !name) return null;

  const surfacesRaw = Array.isArray(record.surfaces) ? record.surfaces : [];
  const surfaces = surfacesRaw
    .map((entry): DesignTaskProductSurface | null => {
      if (!entry || typeof entry !== "object") return null;
      const surface = entry as Record<string, unknown>;
      const methodId = asString(surface.method_id);
      const methodLabel = asString(surface.method_label);
      const positionId = asString(surface.position_id);
      const positionLabel = asString(surface.position_label);
      if (!methodId && !methodLabel && !positionId && !positionLabel) return null;
      return { methodId, methodLabel, positionId, positionLabel };
    })
    .filter((surface): surface is DesignTaskProductSurface => surface !== null);

  const productKind: DesignTaskProductKind = record.product_kind === "print" ? "print" : "merch";

  return {
    productKind,
    catalogTypeId: asString(record.catalog_type_id),
    catalogKindId: asString(record.catalog_kind_id),
    catalogModelId: modelId,
    variantId: asString(record.variant_id),
    variantName: asString(record.variant_name),
    sku: asString(record.sku),
    name: name ?? "",
    imageUrl: asString(record.image_url),
    supplierUrl: asString(record.supplier_url),
    avantprintUrl: asString(record.avantprint_url),
    printSides: productKind === "print" ? asPrintSide(record.print_sides) : null,
    surfaces,
  };
}
