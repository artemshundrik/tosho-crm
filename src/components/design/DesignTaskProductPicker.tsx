/**
 * DesignTaskProductPicker — a slimmed-down catalog product picker for the
 * "create standalone design task" flow, shown only for Візуалізація-family
 * types. Mirrors the quote batch-builder cascade (Категорія → Вид → Модель +
 * Нанесення) but limited to apparel (quote_type === "merch"), a single product,
 * and method+position surfaces (no mm sizes). Supplier links ride along from the
 * chosen model's metadata, never picked manually — same as quotes.
 *
 * Fully self-contained: loads its own catalog via useCatalogData(teamId).
 */

import { useEffect, useMemo } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CatalogModelPicker,
  getVariantOptionValue,
  resolveModelPickerValue,
} from "@/components/catalog/CatalogModelPicker";
import { useCatalogData } from "@/features/catalog/ProductCatalogPage/hooks/useCatalogData";
import {
  createEmptyDesignTaskProduct,
  DESIGN_TASK_PRINT_SIDE_LABELS,
  type DesignTaskPrintSide,
  type DesignTaskProduct,
  type DesignTaskProductKind,
  type DesignTaskProductSurface,
} from "@/lib/designTaskProduct";

type DesignTaskProductPickerProps = {
  teamId: string | null;
  value: DesignTaskProduct | null;
  onChange: (value: DesignTaskProduct | null) => void;
};

const emptySurface: DesignTaskProductSurface = {
  methodId: null,
  methodLabel: null,
  positionId: null,
  positionLabel: null,
};

const PRODUCT_KIND_TABS: Array<{ value: DesignTaskProductKind; label: string }> = [
  { value: "merch", label: "Одяг / мерч" },
  { value: "print", label: "Поліграфія" },
];

const PRINT_SIDE_TABS = Object.entries(DESIGN_TASK_PRINT_SIDE_LABELS) as Array<[DesignTaskPrintSide, string]>;

export function DesignTaskProductPicker({ teamId, value, onChange }: DesignTaskProductPickerProps) {
  const { catalog, catalogLoading, ensureKindModelsLoaded } = useCatalogData(teamId);

  const productKind: DesignTaskProductKind = value?.productKind ?? "merch";

  const merchTypes = useMemo(
    () => catalog.filter((type) => type.quote_type === "merch"),
    [catalog]
  );
  const printTypes = useMemo(
    () => catalog.filter((type) => type.quote_type === "print"),
    [catalog]
  );

  const selectedPrintType = useMemo(
    () => printTypes.find((type) => type.id === value?.catalogTypeId) ?? null,
    [printTypes, value?.catalogTypeId]
  );

  const switchKind = (kind: DesignTaskProductKind) => {
    if (kind === productKind) return;
    onChange(createEmptyDesignTaskProduct(kind));
  };

  const handlePrintTypeChange = (typeId: string) => {
    const type = printTypes.find((item) => item.id === typeId) ?? null;
    onChange({
      ...createEmptyDesignTaskProduct("print"),
      catalogTypeId: typeId,
      name: type?.name ?? "",
      printSides: value?.printSides ?? "one_side",
    });
  };

  const handlePrintSidesChange = (sides: DesignTaskPrintSide) => {
    if (!value) return;
    onChange({ ...value, printSides: sides });
  };

  const selectedType = useMemo(
    () => merchTypes.find((type) => type.id === value?.catalogTypeId) ?? null,
    [merchTypes, value?.catalogTypeId]
  );
  const kinds = useMemo(() => selectedType?.kinds ?? [], [selectedType]);
  const selectedKind = useMemo(
    () => kinds.find((kind) => kind.id === value?.catalogKindId) ?? null,
    [kinds, value?.catalogKindId]
  );
  const models = useMemo(() => selectedKind?.models ?? [], [selectedKind]);
  const selectedModel = useMemo(
    () => models.find((model) => model.id === value?.catalogModelId) ?? null,
    [models, value?.catalogModelId]
  );

  // Many kinds carry no own methods/positions — the quote builder falls back to
  // the catalog-wide list in that case, so mirror it here (dedupe by id).
  const allMethods = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const type of catalog) {
      for (const kind of type.kinds) {
        for (const method of kind.methods) map.set(method.id, method);
      }
    }
    return Array.from(map.values());
  }, [catalog]);
  const allPositions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const type of catalog) {
      for (const kind of type.kinds) {
        for (const position of kind.printPositions) map.set(position.id, position);
      }
    }
    return Array.from(map.values());
  }, [catalog]);
  const methods = selectedKind?.methods.length ? selectedKind.methods : allMethods;
  const positions = selectedKind?.printPositions.length ? selectedKind.printPositions : allPositions;

  // When a kind is chosen (or restored) but its models haven't been fetched yet,
  // lazily pull them so the model picker isn't empty.
  useEffect(() => {
    if (value?.catalogKindId) {
      void ensureKindModelsLoaded(value.catalogKindId);
    }
  }, [value?.catalogKindId, ensureKindModelsLoaded]);

  const emptyProductFields = {
    catalogModelId: null,
    variantId: null,
    variantName: null,
    sku: null,
    name: "",
    imageUrl: null,
    supplierUrl: null,
    avantprintUrl: null,
  };

  const handleTypeChange = (typeId: string) => {
    onChange({
      productKind: "merch",
      catalogTypeId: typeId,
      catalogKindId: null,
      ...emptyProductFields,
      printSides: null,
      surfaces: [],
    });
  };

  const handleKindChange = (kindId: string) => {
    if (!value) return;
    void ensureKindModelsLoaded(kindId);
    onChange({
      ...value,
      catalogKindId: kindId,
      ...emptyProductFields,
      surfaces: [],
    });
  };

  const modelPickerValue = value?.catalogModelId
    ? getVariantOptionValue(value.catalogModelId, value.variantId)
    : "";

  const handleModelChange = (nextValue: string) => {
    if (!value) return;
    const resolved = resolveModelPickerValue(models, nextValue);
    if (!resolved) return;
    onChange({
      ...value,
      catalogModelId: resolved.modelId,
      variantId: resolved.variantId,
      variantName: resolved.variantName,
      sku: resolved.sku,
      name: resolved.name,
      imageUrl: resolved.imageUrl,
      supplierUrl: resolved.supplierUrl,
      avantprintUrl: resolved.avantprintUrl,
    });
  };

  const addSurface = () => {
    if (!value) return;
    onChange({ ...value, surfaces: [...value.surfaces, { ...emptySurface }] });
  };

  const removeSurface = (index: number) => {
    if (!value) return;
    onChange({ ...value, surfaces: value.surfaces.filter((_, i) => i !== index) });
  };

  const updateSurface = (index: number, patch: Partial<DesignTaskProductSurface>) => {
    if (!value) return;
    onChange({
      ...value,
      surfaces: value.surfaces.map((surface, i) => (i === index ? { ...surface, ...patch } : surface)),
    });
  };

  const handleSurfaceMethodChange = (index: number, methodId: string) => {
    const method = methods.find((item) => item.id === methodId) ?? null;
    updateSurface(index, { methodId, methodLabel: method?.name ?? null });
  };

  const handleSurfacePositionChange = (index: number, positionId: string) => {
    const position = positions.find((item) => item.id === positionId) ?? null;
    updateSurface(index, { positionId, positionLabel: position?.label ?? null });
  };

  const clearProduct = () => onChange(null);

  const supplierLinks: Array<{ label: string; url: string | null }> = [
    { label: "Постачальник", url: value?.supplierUrl ?? null },
    { label: "Аванпринт", url: value?.avantprintUrl ?? null },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Товар</Label>
        {value?.catalogTypeId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={clearProduct}
          >
            <X className="h-3.5 w-3.5" />
            Прибрати
          </Button>
        ) : null}
      </div>

      {/* Product kind — apparel/merch cascade vs simplified поліграфія */}
      <div className="inline-flex rounded-lg border border-border/60 bg-background p-0.5">
        {PRODUCT_KIND_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => switchKind(tab.value)}
            className={cn(
              "h-7 rounded-md px-3 text-xs font-medium transition-colors",
              productKind === tab.value
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {productKind === "merch" ? (
      <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Категорія (apparel types only) */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Категорія</Label>
          <Select value={value?.catalogTypeId ?? ""} onValueChange={handleTypeChange} disabled={catalogLoading}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={catalogLoading ? "Завантаження…" : "Оберіть категорію"} />
            </SelectTrigger>
            <SelectContent>
              {merchTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Вид */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Вид</Label>
          <Select
            value={value?.catalogKindId ?? ""}
            onValueChange={handleKindChange}
            disabled={!selectedType}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={selectedType ? "Оберіть вид" : "Спершу категорія"} />
            </SelectTrigger>
            <SelectContent>
              {kinds.map((kind) => (
                <SelectItem key={kind.id} value={kind.id}>
                  {kind.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Модель — searchable, with modifications (варіанти) + article */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Модель</Label>
        <CatalogModelPicker
          value={modelPickerValue}
          onChange={handleModelChange}
          models={models}
          placeholder={selectedKind ? "Оберіть модель" : "Спершу вид"}
          disabled={!selectedKind}
        />
        {value?.sku ? (
          <p className="pt-0.5 text-xs text-muted-foreground">Артикул: {value.sku}</p>
        ) : null}
      </div>

      {/* Supplier links — auto, from the model snapshot */}
      {selectedModel ? (
        <div className="flex flex-wrap gap-2">
          {supplierLinks.map((link) =>
            link.url ? (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1 text-xs text-foreground hover:bg-muted/40"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {link.label}
              </a>
            ) : (
              <span
                key={link.label}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border/50 px-2.5 py-1 text-xs text-muted-foreground/60"
                title="Немає посилання в каталозі"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {link.label}
              </span>
            )
          )}
        </div>
      ) : null}

      {/* Нанесення — method + position (no mm) */}
      {selectedKind ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Нанесення</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={addSurface}
            >
              <Plus className="h-3.5 w-3.5" />
              Додати
            </Button>
          </div>
          {value && value.surfaces.length > 0 ? (
            <div className="space-y-2">
              {value.surfaces.map((surface, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    value={surface.methodId ?? ""}
                    onValueChange={(methodId) => handleSurfaceMethodChange(index, methodId)}
                  >
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue placeholder="Метод" />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={surface.positionId ?? ""}
                    onValueChange={(positionId) => handleSurfacePositionChange(index, positionId)}
                  >
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue placeholder="Позиція" />
                    </SelectTrigger>
                    <SelectContent>
                      {positions.map((position) => (
                        <SelectItem key={position.id} value={position.id}>
                          {position.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground"
                    onClick={() => removeSurface(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/70">Поверхні не додані</p>
          )}
        </div>
      ) : null}
      </>
      ) : (
      <div className="space-y-3">
        {/* Що друкуєш — print category (поліграфія) */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Що друкуєш</Label>
          <Select
            value={value?.catalogTypeId ?? ""}
            onValueChange={handlePrintTypeChange}
            disabled={catalogLoading}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={catalogLoading ? "Завантаження…" : "Оберіть, що друкуємо"} />
            </SelectTrigger>
            <SelectContent>
              {printTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Кількість сторін друку — спрощено */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Друк</Label>
          <div className="inline-flex rounded-lg border border-border/60 bg-background p-0.5">
            {PRINT_SIDE_TABS.map(([side, label]) => (
              <button
                key={side}
                type="button"
                disabled={!selectedPrintType}
                onClick={() => handlePrintSidesChange(side)}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-50",
                  value?.printSides === side
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
