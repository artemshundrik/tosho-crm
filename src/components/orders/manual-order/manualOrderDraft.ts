import type { ManualOrderItemInput } from "@/features/orders/orderRecords";
import type {
  QuoteImportDraftItem,
  QuoteImportLinkPreview,
} from "@/features/quotes/quote-import/types";
import type { SupplierPoolProduct, SupplierPoolVariant } from "@/lib/supplierPool";

/**
 * Чернетка позиції у вікні «Замовлення без прорахунку» (REQ-353).
 *
 * Товарні поля ті самі, що в чернетці прорахунку: їх заповнює той самий код
 * (`productDraftFields`). Своє тут те, чого в прорахунку на цьому кроці немає:
 * кількість і ціна одним числом, одиниця, розмір нанесення.
 */
export type ManualOrderDraftItem = Pick<QuoteImportDraftItem, "key" | "name" | "links" | "catalog" | "sku" | "imprints"> & {
  color: string | null;
  poolPrice: { amount: number; currency: string } | null;
  /** Що за число в `poolPrice`: оптова закупка чи ціна на вітрині сайту. */
  poolPriceKind: "retail" | "wholesale" | null;
  isKids: boolean;
  supplierUrl: string | null;
  avantprintUrl: string | null;
  supplierProductId: string | null;
  variantId: string | null;
  /** Кольори, з яких обирають. Менше двох означає, що питати нема про що. */
  colorOptions: SupplierPoolVariant[];
  /** Картка пулу цих кольорів. `null` — кольори моделі каталогу. */
  colorSource: SupplierPoolProduct | null;
  qty: string;
  unit: string;
  unitPrice: string;
  /** Розмір кожного нанесення, ключ — `imprint.key`. */
  sizes: Record<string, { width: string; height: string }>;
};

export type ManualOrderDraftService = { key: string; name: string; qty: string; unitPrice: string };

export const createManualOrderDraft = (partial: Partial<ManualOrderDraftItem> = {}): ManualOrderDraftItem => ({
  key: crypto.randomUUID(),
  name: "",
  links: [],
  catalog: null,
  sku: null,
  imprints: [],
  color: null,
  poolPrice: null,
  poolPriceKind: null,
  isKids: false,
  supplierUrl: null,
  avantprintUrl: null,
  supplierProductId: null,
  variantId: null,
  colorOptions: [],
  colorSource: null,
  // Кількість порожня, як тираж у прорахунку: підставлене число виглядає як
  // відповідь, а знає її лише клієнт.
  qty: "",
  unit: "шт.",
  unitPrice: "",
  sizes: {},
  ...partial,
});

export const createManualOrderService = (): ManualOrderDraftService => ({
  key: crypto.randomUUID(),
  name: "",
  qty: "1",
  unitPrice: "",
});

export const needsColorChoice = (draft: Pick<ManualOrderDraftItem, "color" | "colorOptions">) =>
  draft.colorOptions.length > 1 && !draft.color;

export type ManualOrderIssue = {
  /** Те саме значення стоїть у `data-issue` поля, якого бракує. */
  id: string;
  text: string;
};

export type ManualOrderIssueInput = {
  hasCustomer: boolean;
  items: ManualOrderDraftItem[];
  services: ManualOrderDraftService[];
  previews: Record<string, QuoteImportLinkPreview | undefined>;
  amountOf: (raw: string) => number;
  isCashless: boolean;
  orderTotal: number;
  hasPrint: boolean;
  designMode: "existing" | "create" | "none";
  selectedDesignTaskId: string;
  deliveryIssue: string | null;
  pricesConfirmed: boolean;
};

/**
 * Чого бракує зараз, по одному. «Створити» не вимикається: натиск веде до цього
 * поля, як у вікні прорахунку. Порядок той, у якому людина заповнює вікно.
 */
export function findManualOrderIssue(input: ManualOrderIssueInput): ManualOrderIssue | null {
  const { items, services, amountOf } = input;
  if (!input.hasCustomer) return { id: "customer", text: "Оберіть Замовника" };
  if (items.length === 0 && services.length === 0) return { id: "items", text: "Додайте товар або послугу" };

  for (const item of items) {
    if (input.previews[item.key]?.status === "pending") {
      return { id: `pending:${item.key}`, text: "Ще читаємо сторінку товару…" };
    }
  }
  for (const item of items) {
    if (!item.name.trim()) return { id: `name:${item.key}`, text: "Впишіть назву товару: сайт її не віддав" };
    if (needsColorChoice(item)) return { id: `color:${item.key}`, text: `Оберіть колір: ${item.name.trim()}` };
    if (amountOf(item.qty) <= 0) return { id: `qty:${item.key}`, text: `Вкажіть кількість: ${item.name.trim()}` };
  }
  for (const service of services) {
    if (!service.name.trim()) return { id: `service:${service.key}`, text: "Впишіть назву послуги" };
    if (amountOf(service.qty) <= 0) {
      return { id: `service-qty:${service.key}`, text: `Вкажіть кількість: ${service.name.trim()}` };
    }
  }
  if (input.isCashless && input.orderTotal <= 0) {
    const first = items[0] ? `price:${items[0].key}` : `service-price:${services[0]?.key}`;
    return { id: first, text: "Вкажіть ціну: від суми підуть СП і рахунок" };
  }
  if (input.hasPrint && input.designMode === "existing" && !input.selectedDesignTaskId) {
    return { id: "design", text: "Оберіть готовий дизайн або перемкніться на створення нового" };
  }
  if (input.deliveryIssue) return { id: "delivery", text: `Логістика: ${input.deliveryIssue}` };
  if (input.isCashless && !input.pricesConfirmed) return { id: "check", text: "Позначте «Ціни перевірив»" };
  return null;
}

/** Колір іде і в назву: саме назву читають документи. Двічі не дописуємо. */
export function manualOrderItemName(draft: Pick<ManualOrderDraftItem, "name" | "color">): string {
  const name = draft.name.trim();
  const color = draft.color?.trim();
  if (!color || name.toLowerCase().endsWith(color.toLowerCase())) return name;
  return `${name} · ${color}`;
}

const sizeValue = (raw: string | undefined) => (raw ?? "").trim().replace(",", ".");

export type ManualOrderItemHelpers = {
  amountOf: (raw: string) => number;
  storedUnitPrice: (entered: string) => number;
  methodName: (kindId: string, methodId: string) => string | null;
  placeLabel: (kindId: string, positionId: string) => string | null;
  images: (key: string) => { imageUrl: string | null; thumbUrl: string | null };
};

export function buildManualOrderItems(
  items: ManualOrderDraftItem[],
  services: ManualOrderDraftService[],
  helpers: ManualOrderItemHelpers
): ManualOrderItemInput[] {
  const goods = items.map<ManualOrderItemInput>((draft) => {
    const kindId = draft.catalog?.kindId ?? "";
    const images = helpers.images(draft.key);
    return {
      name: manualOrderItemName(draft),
      qty: helpers.amountOf(draft.qty),
      unit: draft.unit,
      unitPrice: helpers.storedUnitPrice(draft.unitPrice),
      catalogModelId: draft.catalog?.modelId ?? null,
      imageUrl: images.imageUrl,
      thumbUrl: images.thumbUrl,
      printApplications: draft.imprints.map((imprint) => {
        const size = draft.sizes[imprint.key];
        return {
          methodId: imprint.methodId || null,
          methodLabel: imprint.methodId ? helpers.methodName(kindId, imprint.methodId) : null,
          positionId: imprint.positionId,
          positionLabel:
            imprint.positionLabel ?? (imprint.positionId ? helpers.placeLabel(kindId, imprint.positionId) : null),
          width: sizeValue(size?.width),
          height: sizeValue(size?.height),
        };
      }),
      metadata: {
        sku: draft.sku,
        color: draft.color,
        sourceUrl: draft.links[0] ?? null,
        supplierUrl: draft.supplierUrl,
        avantprintUrl: draft.avantprintUrl,
        supplierProductId: draft.supplierProductId,
        variantId: draft.variantId ?? draft.catalog?.variantId ?? null,
        kindId: draft.catalog?.kindId ?? null,
        kindName: draft.catalog?.kindName ?? null,
        typeName: draft.catalog?.typeName ?? null,
      },
    };
  });
  const lines = services.map<ManualOrderItemInput>((service) => ({
    name: service.name.trim(),
    qty: helpers.amountOf(service.qty),
    unit: "посл.",
    unitPrice: helpers.storedUnitPrice(service.unitPrice),
    catalogModelId: null,
    kind: "service",
    printApplications: [],
  }));
  return [...goods, ...lines];
}
