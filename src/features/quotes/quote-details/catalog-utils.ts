export type CatalogMethod = { id: string; name: string; price?: number };
export type CatalogPrintPosition = { id: string; label: string; sort_order?: number | null };
export type CatalogPriceTier = { id: string; min: number; max: number | null; price: number };
export type CatalogModel = {
  id: string;
  name: string;
  price?: number;
  priceTiers?: CatalogPriceTier[];
  imageUrl?: string;
};
export type CatalogKind = {
  id: string;
  name: string;
  models: CatalogModel[];
  methods: CatalogMethod[];
  printPositions: CatalogPrintPosition[];
};
export type CatalogType = {
  id: string;
  name: string;
  kinds: CatalogKind[];
};

export function getTypeLabel(catalog: CatalogType[], typeId?: string) {
  return catalog.find((type) => type.id === typeId)?.name;
}

export function getKindLabel(catalog: CatalogType[], typeId?: string, kindId?: string) {
  const type = catalog.find((item) => item.id === typeId);
  return type?.kinds.find((kind) => kind.id === kindId)?.name;
}

export function getModelLabel(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  modelId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.models.find((model) => model.id === modelId)?.name;
}

export function getModelImage(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  modelId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.models.find((model) => model.id === modelId)?.imageUrl ?? null;
}

export function getMethodLabel(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  methodId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.methods.find((method) => method.id === methodId)?.name;
}

export function getPrintPositionLabel(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  positionId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.printPositions.find((pos) => pos.id === positionId)?.label;
}

export function getModelPrice(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  modelId?: string,
  qty?: number
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  const model = kind?.models.find((item) => item.id === modelId);
  if (!model) return 0;
  const tiers = model.priceTiers ?? [];
  if (tiers.length > 0 && qty !== undefined) {
    const match = tiers.find((tier) => {
      const max = tier.max ?? Number.POSITIVE_INFINITY;
      return qty >= tier.min && qty <= max;
    });
    if (match) return match.price;
  }
  return model.price ?? 0;
}

export function getMethodPrice(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  methodId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.methods.find((method) => method.id === methodId)?.price ?? 0;
}
