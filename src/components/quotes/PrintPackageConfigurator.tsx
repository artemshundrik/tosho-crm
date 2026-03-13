import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PrintConfiguratorPreset, PrintProductConfig } from "@/lib/printPackage";
import { getConfiguratorProductLabel, getProductKindFromPreset } from "@/lib/printPackage";
import {
  Check,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  ChevronDown,
  Package,
  Paperclip,
  Ruler,
  Scan,
  Layers3,
  Palette,
  BadgeCheck,
  Copy,
  BookOpen,
  StickyNote,
} from "lucide-react";

export type ConfiguratorProductOption = {
  typeId: string;
  typeName: string;
  kindId: string;
  kindName: string;
  modelId: string;
  modelName: string;
  preset: PrintConfiguratorPreset;
  productLabel: string;
};

type SimpleOption = { value: string; label: string };

export const PRINT_PACKAGE_TYPES: SimpleOption[] = [
  { value: "ready", label: "Готовий" },
  { value: "custom", label: "Індивідуальний" },
];

export const PRINT_PACKAGE_ORIENTATIONS: SimpleOption[] = [
  { value: "vertical", label: "Вертикальний" },
  { value: "horizontal", label: "Горизонтальний" },
];

export const PRINT_PACKAGE_PAPER_TYPES: SimpleOption[] = [
  { value: "cardboard", label: "Картон" },
  { value: "paper", label: "Папір" },
  { value: "kraft", label: "Крафт" },
];

export const PRINT_PACKAGE_KRAFT_COLORS: SimpleOption[] = [
  { value: "white", label: "Білий" },
  { value: "brown", label: "Бурий" },
];

export const PRINT_PACKAGE_DENSITIES: Array<{ value: string; label: string; onlyFor?: "kraft" | "cardboard" }> = [
  { value: "90", label: "90г" },
  { value: "110", label: "110г" },
  { value: "120", label: "120г", onlyFor: "kraft" },
  { value: "125", label: "125г" },
  { value: "200", label: "200г" },
  { value: "205", label: "205г", onlyFor: "cardboard" },
  { value: "250", label: "250г" },
];

export const PRINT_PACKAGE_HANDLES: Array<{ value: string; label: string; onlyFor?: "kraft" }> = [
  { value: "ribbon", label: "Лента" },
  { value: "cord", label: "Шнурок" },
  { value: "twisted_paper", label: "Кручена паперова", onlyFor: "kraft" },
  { value: "flat_paper", label: "Плоска паперова", onlyFor: "kraft" },
];

export const YES_NO_OPTIONS: SimpleOption[] = [
  { value: "yes", label: "Так" },
  { value: "no", label: "Ні" },
];

export const PRINT_PACKAGE_PRINT_SIDES: SimpleOption[] = [
  { value: "one_side", label: "З одної сторони" },
  { value: "two_sides", label: "З двох сторін" },
];

export const PRINT_PACKAGE_PRINT_TYPES: Array<{ value: string; label: string; notForReady?: boolean }> = [
  { value: "cmyk", label: "CMYK", notForReady: true },
  { value: "pantone", label: "Pantone" },
  { value: "cmyk_pantone", label: "CMYK+Pantone" },
  { value: "uv_dtf", label: "УФ-DTF" },
  { value: "uv_print", label: "УФ-друк" },
  { value: "screen_print", label: "Трафарет" },
  { value: "sticker", label: "Наліпка/стікер" },
];

export const PRINT_PACKAGE_EXTRA_FINISHING: SimpleOption[] = [
  { value: "none", label: "Немає" },
  { value: "spot_uv_25", label: "Вибірковий лак (до 25%)" },
  { value: "spot_uv_40", label: "Вибірковий лак (до 40%)" },
];

export const PRINT_PACKAGE_EMBOSSING: SimpleOption[] = [
  { value: "none", label: "Немає" },
  { value: "blind_1", label: "Конгрев (сліпе) з одної сторони" },
  { value: "blind_2", label: "Конгрев (сліпе) з двох сторін" },
  { value: "foil_1", label: "Фольга з одної сторони" },
  { value: "foil_2", label: "Фольга з двох сторін" },
];

const NOTEBOOK_FORMATS: SimpleOption[] = [
  { value: "a4", label: "A4" },
  { value: "a5", label: "A5" },
  { value: "a6", label: "A6" },
  { value: "other", label: "Інше" },
];

const NOTEBOOK_COVER_MATERIALS: SimpleOption[] = [
  { value: "coated_paper", label: "Крейдований папір" },
  { value: "carton", label: "Картон" },
  { value: "other", label: "Інше" },
];

const NOTEBOOK_COVER_STOCKS_BY_MATERIAL: Record<string, SimpleOption[]> = {
  coated_paper: [
    { value: "300", label: "300 г/м2" },
    { value: "350", label: "350 г/м2" },
    { value: "other", label: "Інше" },
  ],
  carton: [
    { value: "300", label: "300 г/м2" },
    { value: "350", label: "350 г/м2" },
    { value: "other", label: "Інше" },
  ],
  other: [{ value: "other", label: "Інше" }],
};

const NOTEBOOK_PRINT_OPTIONS: SimpleOption[] = [
  { value: "4_0", label: "4+0" },
  { value: "4_4", label: "4+4" },
  { value: "pantone", label: "Pantone" },
  { value: "1_0", label: "1+0" },
  { value: "2_0", label: "2+0" },
  { value: "1_1", label: "1+1" },
  { value: "2_2", label: "2+2" },
];

const NOTEBOOK_LAMINATION_OPTIONS: SimpleOption[] = [
  { value: "matte", label: "Мат" },
  { value: "gloss", label: "Глянець" },
];

const NOTEBOOK_LAMINATION_SIDES: SimpleOption[] = [
  { value: "1_0", label: "1+0" },
  { value: "1_1", label: "1+1" },
];

const NOTEBOOK_SPOT_UV_COVERAGE: SimpleOption[] = [
  { value: "25", label: "До 25%" },
  { value: "40", label: "До 40%" },
];

const NOTEBOOK_BLOCK_PAPERS: SimpleOption[] = [
  { value: "offset", label: "Офсет" },
  { value: "design_paper", label: "Диз. папір" },
];

const NOTEBOOK_BLOCK_DENSITIES: SimpleOption[] = [
  { value: "80", label: "80 г/м2" },
  { value: "90", label: "90 г/м2" },
  { value: "other", label: "Інше" },
];

const NOTEBOOK_SHEET_COUNTS: SimpleOption[] = [
  { value: "25", label: "25 аркушів" },
  { value: "50", label: "50 аркушів" },
  { value: "other", label: "Інше" },
];

const NOTEBOOK_BINDINGS: SimpleOption[] = [
  { value: "spring", label: "Пружина" },
  { value: "glue", label: "Клей" },
];

const BINDING_SIDES: SimpleOption[] = [
  { value: "short", label: "По короткій стороні" },
  { value: "long", label: "По довгій стороні" },
];

const NOTE_BLOCK_FORMATS: SimpleOption[] = [
  { value: "85x85", label: "85×85" },
  { value: "95x95", label: "95×95" },
  { value: "other", label: "Інше" },
];

const NOTE_BLOCK_PAPERS: SimpleOption[] = [
  { value: "offset", label: "Офсет" },
  { value: "other", label: "Інше" },
];

const NOTE_BLOCK_DENSITIES: SimpleOption[] = [
  { value: "80", label: "80 г/м2" },
  { value: "90", label: "90 г/м2" },
  { value: "other", label: "Інше" },
];

const NOTE_BLOCK_SHEET_COUNTS: SimpleOption[] = [
  { value: "50", label: "50 аркушів" },
  { value: "100", label: "100 аркушів" },
  { value: "200", label: "200 аркушів" },
  { value: "other", label: "Інше" },
];

const NOTE_BLOCK_PRINT_OPTIONS: SimpleOption[] = [
  { value: "4_0", label: "4+0" },
  { value: "pantone", label: "Pantone" },
];

const NOTE_BLOCK_GLUE_SIDES: SimpleOption[] = [
  { value: "top", label: "Зверху" },
  { value: "left", label: "Ліворуч" },
];

const ConfigField: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="space-y-1.5">
    <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
    {children}
  </div>
);

const ChipPicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: SimpleOption[];
  placeholder: string;
  icon: React.ReactNode;
  contentWidthClassName?: string;
}> = ({ value, onChange, options, placeholder, icon, contentWidthClassName }) => {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 w-full items-center rounded-full border px-3.5 text-sm transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
            selected
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70"
          )}
        >
          <span className={cn("mr-2 shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5", selected ? "text-primary" : "text-muted-foreground")}>{icon}</span>
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[260px] p-2", contentWidthClassName)}>
        <div className="space-y-1">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Button
                key={option.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 w-full justify-between text-sm",
                  active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {active ? <Check className="h-4 w-4" /> : null}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ProductSection: React.FC<{
  title: string;
  done: boolean;
  children: React.ReactNode;
}> = ({ title, done, children }) => (
  <div className="space-y-4 border-t border-border/40 pt-5">
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
      {done ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4 text-muted-foreground" />}
      <span>{title}</span>
    </div>
    {children}
  </div>
);

type PrintPackageConfiguratorProps = {
  config: PrintProductConfig;
  onConfigChange: React.Dispatch<React.SetStateAction<PrintProductConfig>>;
  selectedConfiguratorProduct: ConfiguratorProductOption | null;
  configuratorProductOptions: ConfiguratorProductOption[];
  selectedTypeName?: string;
  selectedKindName?: string;
  selectedModelName?: string;
  availablePackageDensities: Array<{ value: string; label: string; onlyFor?: "kraft" | "cardboard" }>;
  availablePackageHandles: Array<{ value: string; label: string; onlyFor?: "kraft" }>;
  availablePackagePrintTypes: Array<{ value: string; label: string; notForReady?: boolean }>;
  onSelectProduct: (option: ConfiguratorProductOption) => void;
};

const resolveProductIcon = (productKind: string) => {
  if (productKind === "notebook") return <BookOpen />;
  if (productKind === "note_blocks") return <StickyNote />;
  return <Package />;
};

export function PrintProductConfigurator({
  config,
  onConfigChange,
  selectedConfiguratorProduct,
  configuratorProductOptions,
  selectedTypeName,
  selectedKindName,
  selectedModelName,
  availablePackageDensities,
  availablePackageHandles,
  availablePackagePrintTypes,
  onSelectProduct,
}: PrintPackageConfiguratorProps) {
  const productKind = config.productKind || (selectedConfiguratorProduct ? getProductKindFromPreset(selectedConfiguratorProduct.preset) : "");
  const selectionLabel =
    selectedConfiguratorProduct?.productLabel ??
    [selectedTypeName, selectedKindName, selectedModelName].filter(Boolean).join(" / ");

  const notebookCoverStocks =
    NOTEBOOK_COVER_STOCKS_BY_MATERIAL[config.notebookCoverMaterial] ?? NOTEBOOK_COVER_STOCKS_BY_MATERIAL.coated_paper;

  const isPackageStructureComplete = React.useMemo(() => {
    if (!config.packageType || !config.orientation) return false;
    if (config.packageType === "ready") return Boolean(config.supplierLink.trim());
    return Boolean(config.widthMm && config.heightMm && config.lengthMm);
  }, [config]);

  const isPackageMaterialComplete = React.useMemo(() => {
    if (!config.paperType || !config.density || !config.handleType) return false;
    if (config.paperType === "kraft" && !config.kraftColor) return false;
    if (config.packageType === "custom" && config.paperType !== "kraft" && !config.eyelets) return false;
    return true;
  }, [config]);

  const isPackagePrintComplete = React.useMemo(() => {
    if (!config.printSides || !config.printType) return false;
    if ((config.printType === "pantone" || config.printType === "cmyk_pantone") && !config.pantoneCount) return false;
    if (config.printType === "sticker" && !config.stickerSize.trim()) return false;
    if (config.packageType === "custom" && !config.lamination) return false;
    return true;
  }, [config]);

  const isNotebookCoverComplete = React.useMemo(() => {
    if (!config.notebookFormat || !config.notebookCoverMaterial || !config.notebookCoverStock || !config.notebookCoverPrint) return false;
    if (config.notebookFormat === "other" && !config.notebookFormatCustom.trim()) return false;
    if (config.notebookCoverStock === "other" && !config.notebookCoverStockCustom.trim()) return false;
    if (config.notebookCoverPrint === "pantone" && !config.notebookCoverPantoneCount.trim()) return false;
    if (!config.notebookLamination || !config.notebookLaminationSides) return false;
    if (config.notebookSpotUv === "yes" && !config.notebookSpotUvCoverage) return false;
    return true;
  }, [config]);

  const isNotebookBlockComplete = React.useMemo(() => {
    if (!config.notebookBlockPaper || !config.notebookBlockDensity || !config.notebookSheetCount || !config.notebookBlockPrint) return false;
    if (config.notebookBlockDensity === "other" && !config.notebookBlockDensityCustom.trim()) return false;
    if (config.notebookSheetCount === "other" && !config.notebookSheetCountCustom.trim()) return false;
    if (config.notebookBlockPrint === "pantone" && !config.notebookBlockPantoneCount.trim()) return false;
    if (!config.notebookBinding || !config.notebookBindingSide) return false;
    return true;
  }, [config]);

  const isNoteBlocksSpecComplete = React.useMemo(() => {
    if (!config.noteBlockFormat || !config.noteBlockHasCover || !config.noteBlockPaper || !config.noteBlockDensity) return false;
    if (config.noteBlockFormat === "other" && !config.noteBlockFormatCustom.trim()) return false;
    if (config.noteBlockPaper === "other" && !config.noteBlockPaperCustom.trim()) return false;
    if (config.noteBlockDensity === "other" && !config.noteBlockDensityCustom.trim()) return false;
    if (!config.noteBlockSheetCount) return false;
    if (config.noteBlockSheetCount === "other" && !config.noteBlockSheetCountCustom.trim()) return false;
    if (!config.noteBlockPrint) return false;
    if (config.noteBlockPrint === "pantone" && !config.noteBlockPantoneCount.trim()) return false;
    if (!config.noteBlockGlue) return false;
    if (config.noteBlockGlue === "yes" && !config.noteBlockGlueSide) return false;
    return true;
  }, [config]);

  const steps =
    productKind === "notebook"
      ? [
          { label: "Обкладинка", done: isNotebookCoverComplete },
          { label: "Блок", done: isNotebookBlockComplete },
        ]
      : productKind === "note_blocks"
        ? [{ label: "Специфікація", done: isNoteBlocksSpecComplete }]
        : [
            { label: "Конструкція", done: isPackageStructureComplete },
            { label: "Матеріал", done: isPackageMaterialComplete },
            { label: "Друк", done: isPackagePrintComplete },
          ];

  const completedSteps = steps.filter((step) => step.done).length;

  return (
    <div className="space-y-6 rounded-[22px] border border-border/40 bg-background/30 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Поліграфія
          </div>
          <div className="text-base font-semibold text-foreground">{selectionLabel || "Конфігурація виробу"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {steps.map((step) => (
            <div
              key={step.label}
              className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground"
            >
              {step.done ? <CheckCircle2 className="h-3.5 w-3.5 text-foreground" /> : <CircleDashed className="h-3.5 w-3.5" />}
              <span className={step.done ? "text-foreground" : undefined}>{step.label}</span>
            </div>
          ))}
          <div className="inline-flex items-center rounded-full border border-border/50 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground">
            {completedSteps}/{steps.length}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ConfigField label="Вид продукції">
          <ChipPicker
            value={selectedConfiguratorProduct?.modelId ?? ""}
            onChange={(value) => {
              const nextOption = configuratorProductOptions.find((option) => option.modelId === value) ?? null;
              if (nextOption) onSelectProduct(nextOption);
            }}
            options={configuratorProductOptions.map((option) => ({
              value: option.modelId,
              label: option.productLabel,
            }))}
            placeholder="Оберіть вид продукції"
            icon={resolveProductIcon(productKind)}
          />
        </ConfigField>
      </div>

      {productKind === "notebook" ? (
        <>
          <ProductSection title="Обкладинка" done={isNotebookCoverComplete}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ConfigField label="Формат">
                <ChipPicker
                  value={config.notebookFormat}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookFormat: value }))}
                  options={NOTEBOOK_FORMATS}
                  placeholder="Оберіть формат"
                  icon={<Ruler />}
                />
              </ConfigField>
              <ConfigField label="Матеріал">
                <ChipPicker
                  value={config.notebookCoverMaterial}
                  onChange={(value) =>
                    onConfigChange((prev) => ({
                      ...prev,
                      notebookCoverMaterial: value,
                      notebookCoverStock: "",
                      notebookCoverStockCustom: "",
                    }))
                  }
                  options={NOTEBOOK_COVER_MATERIALS}
                  placeholder="Оберіть матеріал"
                  icon={<Layers3 />}
                />
              </ConfigField>
              <ConfigField label="Щільність">
                <ChipPicker
                  value={config.notebookCoverStock}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookCoverStock: value }))}
                  options={notebookCoverStocks}
                  placeholder="Оберіть щільність"
                  icon={<Ruler />}
                />
              </ConfigField>
              <ConfigField label="Друк">
                <ChipPicker
                  value={config.notebookCoverPrint}
                  onChange={(value) =>
                    onConfigChange((prev) => ({
                      ...prev,
                      notebookCoverPrint: value,
                      notebookCoverPantoneCount: value === "pantone" ? prev.notebookCoverPantoneCount : "",
                    }))
                  }
                  options={NOTEBOOK_PRINT_OPTIONS.filter((option) => ["4_0", "4_4", "pantone"].includes(option.value))}
                  placeholder="Оберіть друк"
                  icon={<Palette />}
                />
              </ConfigField>
            </div>

            {(config.notebookFormat === "other" ||
              config.notebookCoverStock === "other" ||
              config.notebookCoverPrint === "pantone") && (
              <div className="grid gap-4 md:grid-cols-3">
                {config.notebookFormat === "other" ? (
                  <ConfigField label="Свій формат">
                    <Input
                      value={config.notebookFormatCustom}
                      onChange={(e) => onConfigChange((prev) => ({ ...prev, notebookFormatCustom: e.target.value }))}
                      placeholder="Напр. 210×210 мм"
                      className="h-11 bg-background/70"
                    />
                  </ConfigField>
                ) : null}
                {config.notebookCoverStock === "other" ? (
                  <ConfigField label="Своя щільність">
                    <Input
                      value={config.notebookCoverStockCustom}
                      onChange={(e) => onConfigChange((prev) => ({ ...prev, notebookCoverStockCustom: e.target.value }))}
                      placeholder="Напр. 320 г/м2"
                      className="h-11 bg-background/70"
                    />
                  </ConfigField>
                ) : null}
                {config.notebookCoverPrint === "pantone" ? (
                  <ConfigField label="Кількість Pantone">
                    <Input
                      type="number"
                      value={config.notebookCoverPantoneCount}
                      onChange={(e) => onConfigChange((prev) => ({ ...prev, notebookCoverPantoneCount: e.target.value }))}
                      placeholder="0"
                      className="h-11 bg-background/70"
                    />
                  </ConfigField>
                ) : null}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ConfigField label="Ламінація">
                <ChipPicker
                  value={config.notebookLamination}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookLamination: value }))}
                  options={NOTEBOOK_LAMINATION_OPTIONS}
                  placeholder="Оберіть ламінацію"
                  icon={<BadgeCheck />}
                />
              </ConfigField>
              <ConfigField label="Сторони ламінації">
                <ChipPicker
                  value={config.notebookLaminationSides}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookLaminationSides: value }))}
                  options={NOTEBOOK_LAMINATION_SIDES}
                  placeholder="Оберіть схему"
                  icon={<Copy />}
                />
              </ConfigField>
              <ConfigField label="Вибірковий лак">
                <ChipPicker
                  value={config.notebookSpotUv}
                  onChange={(value) =>
                    onConfigChange((prev) => ({
                      ...prev,
                      notebookSpotUv: value,
                      notebookSpotUvCoverage: value === "yes" ? prev.notebookSpotUvCoverage : "",
                    }))
                  }
                  options={YES_NO_OPTIONS}
                  placeholder="Оберіть варіант"
                  icon={<BadgeCheck />}
                />
              </ConfigField>
              {config.notebookSpotUv === "yes" ? (
                <ConfigField label="Покриття лаком">
                  <ChipPicker
                    value={config.notebookSpotUvCoverage}
                    onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookSpotUvCoverage: value }))}
                    options={NOTEBOOK_SPOT_UV_COVERAGE}
                    placeholder="Оберіть покриття"
                    icon={<CircleDot />}
                  />
                </ConfigField>
              ) : null}
            </div>

            <div className="grid gap-4">
              <ConfigField label="Інше оздоблення">
                <Input
                  value={config.notebookCoverOtherFinishing}
                  onChange={(e) => onConfigChange((prev) => ({ ...prev, notebookCoverOtherFinishing: e.target.value }))}
                  placeholder="Напр. тиснення, висічка"
                  className="h-11 bg-background/70"
                />
              </ConfigField>
            </div>
          </ProductSection>

          <ProductSection title="Блок" done={isNotebookBlockComplete}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ConfigField label="Папір блоку">
                <ChipPicker
                  value={config.notebookBlockPaper}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookBlockPaper: value }))}
                  options={NOTEBOOK_BLOCK_PAPERS}
                  placeholder="Оберіть папір"
                  icon={<Layers3 />}
                />
              </ConfigField>
              <ConfigField label="Щільність блоку">
                <ChipPicker
                  value={config.notebookBlockDensity}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookBlockDensity: value }))}
                  options={NOTEBOOK_BLOCK_DENSITIES}
                  placeholder="Оберіть щільність"
                  icon={<Ruler />}
                />
              </ConfigField>
              <ConfigField label="Кількість аркушів">
                <ChipPicker
                  value={config.notebookSheetCount}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookSheetCount: value }))}
                  options={NOTEBOOK_SHEET_COUNTS}
                  placeholder="Оберіть кількість"
                  icon={<BookOpen />}
                />
              </ConfigField>
              <ConfigField label="Друк блоку">
                <ChipPicker
                  value={config.notebookBlockPrint}
                  onChange={(value) =>
                    onConfigChange((prev) => ({
                      ...prev,
                      notebookBlockPrint: value,
                      notebookBlockPantoneCount: value === "pantone" ? prev.notebookBlockPantoneCount : "",
                    }))
                  }
                  options={NOTEBOOK_PRINT_OPTIONS}
                  placeholder="Оберіть друк"
                  icon={<Palette />}
                />
              </ConfigField>
            </div>

            {(config.notebookBlockDensity === "other" ||
              config.notebookSheetCount === "other" ||
              config.notebookBlockPrint === "pantone") && (
              <div className="grid gap-4 md:grid-cols-3">
                {config.notebookBlockDensity === "other" ? (
                  <ConfigField label="Своя щільність">
                    <Input
                      value={config.notebookBlockDensityCustom}
                      onChange={(e) => onConfigChange((prev) => ({ ...prev, notebookBlockDensityCustom: e.target.value }))}
                      placeholder="Напр. 100 г/м2"
                      className="h-11 bg-background/70"
                    />
                  </ConfigField>
                ) : null}
                {config.notebookSheetCount === "other" ? (
                  <ConfigField label="Своя кількість аркушів">
                    <Input
                      value={config.notebookSheetCountCustom}
                      onChange={(e) => onConfigChange((prev) => ({ ...prev, notebookSheetCountCustom: e.target.value }))}
                      placeholder="Напр. 80"
                      className="h-11 bg-background/70"
                    />
                  </ConfigField>
                ) : null}
                {config.notebookBlockPrint === "pantone" ? (
                  <ConfigField label="Кількість Pantone">
                    <Input
                      type="number"
                      value={config.notebookBlockPantoneCount}
                      onChange={(e) => onConfigChange((prev) => ({ ...prev, notebookBlockPantoneCount: e.target.value }))}
                      placeholder="0"
                      className="h-11 bg-background/70"
                    />
                  </ConfigField>
                ) : null}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ConfigField label="Скріплення">
                <ChipPicker
                  value={config.notebookBinding}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookBinding: value }))}
                  options={NOTEBOOK_BINDINGS}
                  placeholder="Оберіть скріплення"
                  icon={<Paperclip />}
                />
              </ConfigField>
              <ConfigField label="Сторона скріплення">
                <ChipPicker
                  value={config.notebookBindingSide}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, notebookBindingSide: value }))}
                  options={BINDING_SIDES}
                  placeholder="Оберіть сторону"
                  icon={<Scan />}
                  contentWidthClassName="w-[320px]"
                />
              </ConfigField>
            </div>
          </ProductSection>
        </>
      ) : null}

      {productKind === "note_blocks" ? (
        <ProductSection title="Специфікація" done={isNoteBlocksSpecComplete}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ConfigField label="Формат">
              <ChipPicker
                value={config.noteBlockFormat}
                onChange={(value) => onConfigChange((prev) => ({ ...prev, noteBlockFormat: value }))}
                options={NOTE_BLOCK_FORMATS}
                placeholder="Оберіть формат"
                icon={<Ruler />}
              />
            </ConfigField>
            <ConfigField label="Обкладинка">
              <ChipPicker
                value={config.noteBlockHasCover}
                onChange={(value) => onConfigChange((prev) => ({ ...prev, noteBlockHasCover: value }))}
                options={YES_NO_OPTIONS}
                placeholder="Оберіть варіант"
                icon={<BookOpen />}
              />
            </ConfigField>
            <ConfigField label="Папір">
              <ChipPicker
                value={config.noteBlockPaper}
                onChange={(value) => onConfigChange((prev) => ({ ...prev, noteBlockPaper: value }))}
                options={NOTE_BLOCK_PAPERS}
                placeholder="Оберіть папір"
                icon={<Layers3 />}
              />
            </ConfigField>
            <ConfigField label="Щільність">
              <ChipPicker
                value={config.noteBlockDensity}
                onChange={(value) => onConfigChange((prev) => ({ ...prev, noteBlockDensity: value }))}
                options={NOTE_BLOCK_DENSITIES}
                placeholder="Оберіть щільність"
                icon={<Ruler />}
              />
            </ConfigField>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ConfigField label="Кількість аркушів">
              <ChipPicker
                value={config.noteBlockSheetCount}
                onChange={(value) => onConfigChange((prev) => ({ ...prev, noteBlockSheetCount: value }))}
                options={NOTE_BLOCK_SHEET_COUNTS}
                placeholder="Оберіть кількість"
                icon={<StickyNote />}
              />
            </ConfigField>
            <ConfigField label="Друк">
              <ChipPicker
                value={config.noteBlockPrint}
                onChange={(value) =>
                  onConfigChange((prev) => ({
                    ...prev,
                    noteBlockPrint: value,
                    noteBlockPantoneCount: value === "pantone" ? prev.noteBlockPantoneCount : "",
                  }))
                }
                options={NOTE_BLOCK_PRINT_OPTIONS}
                placeholder="Оберіть друк"
                icon={<Palette />}
              />
            </ConfigField>
            <ConfigField label="Клей">
              <ChipPicker
                value={config.noteBlockGlue}
                onChange={(value) =>
                  onConfigChange((prev) => ({
                    ...prev,
                    noteBlockGlue: value,
                    noteBlockGlueSide: value === "yes" ? prev.noteBlockGlueSide : "",
                  }))
                }
                options={YES_NO_OPTIONS}
                placeholder="Оберіть варіант"
                icon={<Paperclip />}
              />
            </ConfigField>
            {config.noteBlockGlue === "yes" ? (
              <ConfigField label="Сторона проклейки">
                <ChipPicker
                  value={config.noteBlockGlueSide}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, noteBlockGlueSide: value }))}
                  options={NOTE_BLOCK_GLUE_SIDES}
                  placeholder="Оберіть сторону"
                  icon={<Scan />}
                />
              </ConfigField>
            ) : null}
          </div>

          {(config.noteBlockFormat === "other" ||
            config.noteBlockPaper === "other" ||
            config.noteBlockDensity === "other" ||
            config.noteBlockSheetCount === "other" ||
            config.noteBlockPrint === "pantone") && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {config.noteBlockFormat === "other" ? (
                <ConfigField label="Свій формат">
                  <Input
                    value={config.noteBlockFormatCustom}
                    onChange={(e) => onConfigChange((prev) => ({ ...prev, noteBlockFormatCustom: e.target.value }))}
                    placeholder="Напр. 90×90 мм"
                    className="h-11 bg-background/70"
                  />
                </ConfigField>
              ) : null}
              {config.noteBlockPaper === "other" ? (
                <ConfigField label="Свій папір">
                  <Input
                    value={config.noteBlockPaperCustom}
                    onChange={(e) => onConfigChange((prev) => ({ ...prev, noteBlockPaperCustom: e.target.value }))}
                    placeholder="Напр. дизайнерський"
                    className="h-11 bg-background/70"
                  />
                </ConfigField>
              ) : null}
              {config.noteBlockDensity === "other" ? (
                <ConfigField label="Своя щільність">
                  <Input
                    value={config.noteBlockDensityCustom}
                    onChange={(e) => onConfigChange((prev) => ({ ...prev, noteBlockDensityCustom: e.target.value }))}
                    placeholder="Напр. 100 г/м2"
                    className="h-11 bg-background/70"
                  />
                </ConfigField>
              ) : null}
              {config.noteBlockSheetCount === "other" ? (
                <ConfigField label="Своя кількість аркушів">
                  <Input
                    value={config.noteBlockSheetCountCustom}
                    onChange={(e) => onConfigChange((prev) => ({ ...prev, noteBlockSheetCountCustom: e.target.value }))}
                    placeholder="Напр. 150"
                    className="h-11 bg-background/70"
                  />
                </ConfigField>
              ) : null}
              {config.noteBlockPrint === "pantone" ? (
                <ConfigField label="Кількість Pantone">
                  <Input
                    type="number"
                    value={config.noteBlockPantoneCount}
                    onChange={(e) => onConfigChange((prev) => ({ ...prev, noteBlockPantoneCount: e.target.value }))}
                    placeholder="0"
                    className="h-11 bg-background/70"
                  />
                </ConfigField>
              ) : null}
            </div>
          )}
        </ProductSection>
      ) : null}

      {(!productKind || productKind === "package") ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ConfigField label="Тип пакету">
              <ChipPicker
                value={config.packageType}
                onChange={(value) =>
                  onConfigChange((prev) => ({
                    ...prev,
                    packageType: value,
                    supplierLink: value === "ready" ? prev.supplierLink : "",
                    widthMm: value === "custom" ? prev.widthMm : "",
                    heightMm: value === "custom" ? prev.heightMm : "",
                    lengthMm: value === "custom" ? prev.lengthMm : "",
                    lamination: value === "custom" ? prev.lamination : "",
                  }))
                }
                options={PRINT_PACKAGE_TYPES}
                placeholder="Оберіть тип"
                icon={<Package />}
              />
            </ConfigField>

            <ConfigField label="Орієнтація">
              <ChipPicker
                value={config.orientation}
                onChange={(value) => onConfigChange((prev) => ({ ...prev, orientation: value }))}
                options={PRINT_PACKAGE_ORIENTATIONS}
                placeholder="Оберіть орієнтацію"
                icon={<Scan />}
              />
            </ConfigField>

            {config.packageType === "custom" && config.paperType !== "kraft" ? (
              <ConfigField label="Люверси">
                <ChipPicker
                  value={config.eyelets}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, eyelets: value }))}
                  options={YES_NO_OPTIONS}
                  placeholder="Оберіть варіант"
                  icon={<CircleDot />}
                />
              </ConfigField>
            ) : null}
          </div>

          {config.packageType === "ready" ? (
            <div className="grid gap-4">
              <ConfigField label="Посилання постачальника">
                <Input
                  value={config.supplierLink}
                  onChange={(e) => onConfigChange((prev) => ({ ...prev, supplierLink: e.target.value }))}
                  placeholder="https://..."
                  className="h-11 bg-background/70"
                />
              </ConfigField>
            </div>
          ) : null}

          {config.packageType === "custom" ? (
            <div className="grid gap-4 border-t border-border/40 pt-5 md:grid-cols-3">
              <ConfigField label="Ширина, мм">
                <Input type="number" value={config.widthMm} onChange={(e) => onConfigChange((prev) => ({ ...prev, widthMm: e.target.value }))} placeholder="0" className="h-11 bg-background/70" />
              </ConfigField>
              <ConfigField label="Висота, мм">
                <Input type="number" value={config.heightMm} onChange={(e) => onConfigChange((prev) => ({ ...prev, heightMm: e.target.value }))} placeholder="0" className="h-11 bg-background/70" />
              </ConfigField>
              <ConfigField label="Довжина, мм">
                <Input type="number" value={config.lengthMm} onChange={(e) => onConfigChange((prev) => ({ ...prev, lengthMm: e.target.value }))} placeholder="0" className="h-11 bg-background/70" />
              </ConfigField>
            </div>
          ) : null}

          <ProductSection title="Матеріал" done={isPackageMaterialComplete}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ConfigField label="Матеріал">
                <ChipPicker
                  value={config.paperType}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, paperType: value }))}
                  options={PRINT_PACKAGE_PAPER_TYPES}
                  placeholder="Оберіть матеріал"
                  icon={<Layers3 />}
                />
              </ConfigField>

              {config.paperType === "kraft" ? (
                <ConfigField label="Колір крафту">
                  <ChipPicker
                    value={config.kraftColor}
                    onChange={(value) => onConfigChange((prev) => ({ ...prev, kraftColor: value }))}
                    options={PRINT_PACKAGE_KRAFT_COLORS}
                    placeholder="Оберіть колір"
                    icon={<Palette />}
                  />
                </ConfigField>
              ) : null}

              <ConfigField label="Щільність">
                <ChipPicker
                  value={config.density}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, density: value }))}
                  options={availablePackageDensities}
                  placeholder="Оберіть щільність"
                  icon={<Ruler />}
                />
              </ConfigField>

              <ConfigField label="Ручки">
                <ChipPicker
                  value={config.handleType}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, handleType: value }))}
                  options={availablePackageHandles}
                  placeholder="Оберіть ручки"
                  icon={<Paperclip />}
                  contentWidthClassName="w-[320px]"
                />
              </ConfigField>
            </div>
          </ProductSection>

          <ProductSection title="Друк" done={isPackagePrintComplete}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ConfigField label="Кількість нанесень">
                <ChipPicker
                  value={config.printSides}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, printSides: value }))}
                  options={PRINT_PACKAGE_PRINT_SIDES}
                  placeholder="Оберіть варіант"
                  icon={<Copy />}
                />
              </ConfigField>

              <ConfigField label="Тип нанесення">
                <ChipPicker
                  value={config.printType}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, printType: value }))}
                  options={availablePackagePrintTypes}
                  placeholder="Оберіть тип"
                  icon={<Palette />}
                  contentWidthClassName="w-[320px]"
                />
              </ConfigField>

              {config.printType === "pantone" || config.printType === "cmyk_pantone" ? (
                <ConfigField label="Кількість пантонів">
                  <Input type="number" value={config.pantoneCount} onChange={(e) => onConfigChange((prev) => ({ ...prev, pantoneCount: e.target.value }))} placeholder="0" className="h-11 bg-background/70" />
                </ConfigField>
              ) : null}

              {config.printType === "sticker" ? (
                <ConfigField label="Розмір стікера">
                  <Input value={config.stickerSize} onChange={(e) => onConfigChange((prev) => ({ ...prev, stickerSize: e.target.value }))} placeholder="80 × 120 мм" className="h-11 bg-background/70" />
                </ConfigField>
              ) : null}

              {config.packageType === "custom" ? (
                <ConfigField label="Ламінація">
                  <ChipPicker
                    value={config.lamination}
                    onChange={(value) => onConfigChange((prev) => ({ ...prev, lamination: value }))}
                    options={YES_NO_OPTIONS}
                    placeholder="Оберіть варіант"
                    icon={<BadgeCheck />}
                  />
                </ConfigField>
              ) : null}

              <ConfigField label="Додаткове оздоблення">
                <ChipPicker
                  value={config.extraFinishing}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, extraFinishing: value }))}
                  options={PRINT_PACKAGE_EXTRA_FINISHING}
                  placeholder="Оберіть оздоблення"
                  icon={<BadgeCheck />}
                  contentWidthClassName="w-[320px]"
                />
              </ConfigField>

              <ConfigField label="Тиснення">
                <ChipPicker
                  value={config.embossing}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, embossing: value }))}
                  options={PRINT_PACKAGE_EMBOSSING}
                  placeholder="Оберіть тиснення"
                  icon={<CircleDot />}
                  contentWidthClassName="w-[320px]"
                />
              </ConfigField>
            </div>
          </ProductSection>
        </>
      ) : null}
    </div>
  );
}

export const PrintPackageConfigurator = PrintProductConfigurator;
