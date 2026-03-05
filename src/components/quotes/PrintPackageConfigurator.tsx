import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { PrintPackageConfig } from "@/lib/printPackage";

export type ConfiguratorProductOption = {
  typeId: string;
  typeName: string;
  kindId: string;
  kindName: string;
  modelId: string;
  modelName: string;
  preset: "print_package";
  productLabel: string;
};

export const PRINT_PACKAGE_TYPES: Array<{ value: string; label: string }> = [
  { value: "ready", label: "Готовий" },
  { value: "custom", label: "Індивідуальний" },
];

export const PRINT_PACKAGE_ORIENTATIONS: Array<{ value: string; label: string }> = [
  { value: "vertical", label: "Вертикальний" },
  { value: "horizontal", label: "Горизонтальний" },
];

export const PRINT_PACKAGE_PAPER_TYPES: Array<{ value: string; label: string }> = [
  { value: "cardboard", label: "Картон" },
  { value: "paper", label: "Папір" },
  { value: "kraft", label: "Крафт" },
];

export const PRINT_PACKAGE_KRAFT_COLORS: Array<{ value: string; label: string }> = [
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

export const YES_NO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "yes", label: "Так" },
  { value: "no", label: "Ні" },
];

export const PRINT_PACKAGE_PRINT_SIDES: Array<{ value: string; label: string }> = [
  { value: "one_side", label: "З одної сторони (однакове або різне зображення)" },
  { value: "two_sides", label: "З двох сторін (однакове або різне зображення)" },
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

export const PRINT_PACKAGE_EXTRA_FINISHING: Array<{ value: string; label: string }> = [
  { value: "none", label: "Немає" },
  { value: "spot_uv_25", label: "Вибірковий лак (до 25%)" },
  { value: "spot_uv_40", label: "Вибірковий лак (до 40%)" },
];

export const PRINT_PACKAGE_EMBOSSING: Array<{ value: string; label: string }> = [
  { value: "none", label: "Немає" },
  { value: "blind_1", label: "Конгрев (сліпе) з одної сторони" },
  { value: "blind_2", label: "Конгрев (сліпе) з двох сторін" },
  { value: "foil_1", label: "Фольга з одної сторони" },
  { value: "foil_2", label: "Фольга з двох сторін" },
];

const ConfigSection: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <div className="rounded-[var(--radius-lg)] border border-border/50 bg-background/40 p-4 md:p-5 space-y-4">
    <div className="space-y-1">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
    </div>
    {children}
  </div>
);

const ConfigField: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <label className="space-y-1.5">
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-foreground/90">{label}</span>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
    {children}
  </label>
);

const SegmentedOptions: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  columns?: "two" | "auto" | "single";
}> = ({ value, onChange, options, columns = "two" }) => (
  <ToggleGroup
    type="single"
    value={value}
    onValueChange={(next) => {
      if (typeof next === "string" && next) onChange(next);
    }}
    className={cn(
      "grid w-full gap-2",
      columns === "single"
        ? "grid-cols-1"
        : columns === "two"
          ? "grid-cols-2"
          : "grid-cols-1 md:grid-cols-2"
    )}
  >
    {options.map((option) => (
      <ToggleGroupItem
        key={option.value}
        value={option.value}
        className={cn(
          "min-h-10 whitespace-normal break-words text-center leading-snug",
          "justify-center rounded-[var(--radius-md)] border border-border/60 bg-background/60 px-3 py-2 text-sm",
          "text-muted-foreground data-[state=on]:border-primary/40 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
        )}
      >
        {option.label}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);

const ChoiceCards: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; title: string; description?: string }>;
}> = ({ value, onChange, options }) => (
  <div className="grid gap-2">
    {options.map((option) => {
      const active = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            active
              ? "border-primary/50 bg-primary/10 shadow-sm"
              : "border-border/60 bg-background/60 hover:border-border hover:bg-background/80"
          )}
        >
          <div className={cn("text-sm font-semibold", active ? "text-primary" : "text-foreground")}>
            {option.title}
          </div>
          {option.description ? (
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{option.description}</div>
          ) : null}
        </button>
      );
    })}
  </div>
);

type PrintPackageConfiguratorProps = {
  config: PrintPackageConfig;
  onConfigChange: React.Dispatch<React.SetStateAction<PrintPackageConfig>>;
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

export function PrintPackageConfigurator({
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
  const isPackageStructureComplete = React.useMemo(() => {
    if (!config.packageType || !config.orientation) return false;
    if (config.packageType === "ready") return true;
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

  return (
    <div className="space-y-4 rounded-[var(--radius-xl)] border border-primary/15 bg-gradient-to-b from-primary/[0.07] via-background/60 to-background/40 p-4 md:p-5">
      <div className="w-full md:max-w-[260px]">
        <ConfigField label="Вид продукції">
          <Select
            value={selectedConfiguratorProduct?.modelId ?? ""}
            onValueChange={(value) => {
              const nextOption = configuratorProductOptions.find((option) => option.modelId === value) ?? null;
              if (nextOption) onSelectProduct(nextOption);
            }}
          >
            <SelectTrigger className="h-10 bg-background/70">
              <SelectValue placeholder="Оберіть вид продукції" />
            </SelectTrigger>
            <SelectContent>
              {configuratorProductOptions.map((option) => (
                <SelectItem key={option.modelId} value={option.modelId}>
                  {option.productLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ConfigField>
      </div>

      <ConfigSection title="Конструкція" description="Спочатку задайте тип пакета і його базову геометрію.">
        <div className="grid gap-4 md:grid-cols-2">
          <ConfigField label="Тип пакету">
            <SegmentedOptions
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
            />
          </ConfigField>
          {config.packageType === "ready" ? (
            <ConfigField label="Посилання на пакет постачальника">
              <Input
                value={config.supplierLink}
                onChange={(e) => onConfigChange((prev) => ({ ...prev, supplierLink: e.target.value }))}
                placeholder="https://..."
                className="h-10 bg-background/70"
              />
            </ConfigField>
          ) : null}
        </div>

        {config.packageType === "custom" ? (
          <div className="rounded-[var(--radius-lg)] border border-border/50 bg-muted/20 p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">Розмір</div>
            <div className="grid gap-3 md:grid-cols-3">
              <ConfigField label="Ширина, мм">
                <Input type="number" value={config.widthMm} onChange={(e) => onConfigChange((prev) => ({ ...prev, widthMm: e.target.value }))} placeholder="0" className="h-10 bg-background/70" />
              </ConfigField>
              <ConfigField label="Висота, мм">
                <Input type="number" value={config.heightMm} onChange={(e) => onConfigChange((prev) => ({ ...prev, heightMm: e.target.value }))} placeholder="0" className="h-10 bg-background/70" />
              </ConfigField>
              <ConfigField label="Довжина, мм">
                <Input type="number" value={config.lengthMm} onChange={(e) => onConfigChange((prev) => ({ ...prev, lengthMm: e.target.value }))} placeholder="0" className="h-10 bg-background/70" />
              </ConfigField>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <ConfigField label="Орієнтація">
            <SegmentedOptions value={config.orientation} onChange={(value) => onConfigChange((prev) => ({ ...prev, orientation: value }))} options={PRINT_PACKAGE_ORIENTATIONS} />
          </ConfigField>
          {config.packageType === "custom" && config.paperType !== "kraft" ? (
            <ConfigField label="Люверси">
              <SegmentedOptions value={config.eyelets} onChange={(value) => onConfigChange((prev) => ({ ...prev, eyelets: value }))} options={YES_NO_OPTIONS} />
            </ConfigField>
          ) : null}
        </div>
      </ConfigSection>

      <ConfigSection title="Матеріал" description="Оберіть основу пакета, щільність і тип ручок.">
        {isPackageStructureComplete ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ConfigField label="Вид паперу">
              <Select value={config.paperType} onValueChange={(value) => onConfigChange((prev) => ({ ...prev, paperType: value }))}>
                <SelectTrigger className="h-10 bg-background/70">
                  <SelectValue placeholder="Оберіть вид паперу" />
                </SelectTrigger>
                <SelectContent>
                  {PRINT_PACKAGE_PAPER_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ConfigField>
            {config.paperType === "kraft" ? (
              <ConfigField label="Колір крафту">
                <SegmentedOptions value={config.kraftColor} onChange={(value) => onConfigChange((prev) => ({ ...prev, kraftColor: value }))} options={PRINT_PACKAGE_KRAFT_COLORS} />
              </ConfigField>
            ) : null}
            <ConfigField label="Щільність">
              <Select value={config.density} onValueChange={(value) => onConfigChange((prev) => ({ ...prev, density: value }))}>
                <SelectTrigger className="h-10 bg-background/70">
                  <SelectValue placeholder="Оберіть щільність" />
                </SelectTrigger>
                <SelectContent>
                  {availablePackageDensities.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ConfigField>
            <ConfigField label="Ручки">
              <Select value={config.handleType} onValueChange={(value) => onConfigChange((prev) => ({ ...prev, handleType: value }))}>
                <SelectTrigger className="h-10 bg-background/70">
                  <SelectValue placeholder="Оберіть ручки" />
                </SelectTrigger>
                <SelectContent>
                  {availablePackageHandles.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ConfigField>
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Спочатку завершіть конструкцію пакета: тип, орієнтацію і розмір для індивідуального варіанту.
          </div>
        )}
      </ConfigSection>

      <ConfigSection title="Друк та оздоблення" description="Налаштуйте нанесення й додаткові ефекти після вибору конструкції та матеріалу.">
        {isPackageStructureComplete && isPackageMaterialComplete ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <ConfigField label="Кількість нанесень">
                <ChoiceCards
                  value={config.printSides}
                  onChange={(value) => onConfigChange((prev) => ({ ...prev, printSides: value }))}
                  options={[
                    {
                      value: "one_side",
                      title: "З одної сторони",
                      description: "Одна зона друку. Підійде для простого або економного нанесення.",
                    },
                    {
                      value: "two_sides",
                      title: "З двох сторін",
                      description: "Друк з обох боків пакета, з однаковим або різним зображенням.",
                    },
                  ]}
                />
              </ConfigField>
              <ConfigField label="Тип нанесення">
                <Select value={config.printType} onValueChange={(value) => onConfigChange((prev) => ({ ...prev, printType: value }))}>
                  <SelectTrigger className="h-10 bg-background/70">
                    <SelectValue placeholder="Оберіть тип нанесення" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePackagePrintTypes.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ConfigField>
              {config.printType === "pantone" || config.printType === "cmyk_pantone" ? (
                <ConfigField label="Кількість пантонів">
                  <Input type="number" value={config.pantoneCount} onChange={(e) => onConfigChange((prev) => ({ ...prev, pantoneCount: e.target.value }))} placeholder="0" className="h-10 bg-background/70" />
                </ConfigField>
              ) : null}
              {config.printType === "sticker" ? (
                <ConfigField label="Розмір наліпки/стікера">
                  <Input value={config.stickerSize} onChange={(e) => onConfigChange((prev) => ({ ...prev, stickerSize: e.target.value }))} placeholder="Напр. 80 × 120 мм" className="h-10 bg-background/70" />
                </ConfigField>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {config.packageType === "custom" ? (
                <ConfigField label="Ламінація">
                  <SegmentedOptions value={config.lamination} onChange={(value) => onConfigChange((prev) => ({ ...prev, lamination: value }))} options={YES_NO_OPTIONS} />
                </ConfigField>
              ) : null}
              <ConfigField label="Додаткове оздоблення">
                <Select value={config.extraFinishing} onValueChange={(value) => onConfigChange((prev) => ({ ...prev, extraFinishing: value }))}>
                  <SelectTrigger className="h-10 bg-background/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINT_PACKAGE_EXTRA_FINISHING.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ConfigField>
              <ConfigField label="Тиснення">
                <Select value={config.embossing} onValueChange={(value) => onConfigChange((prev) => ({ ...prev, embossing: value }))}>
                  <SelectTrigger className="h-10 bg-background/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINT_PACKAGE_EMBOSSING.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ConfigField>
            </div>
          </>
        ) : (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Крок друку відкриється після вибору матеріалу, щільності, ручок і, за потреби, люверсів.
          </div>
        )}
      </ConfigSection>
    </div>
  );
}
