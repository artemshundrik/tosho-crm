import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PrintPackageConfig } from "@/lib/printPackage";
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
  Eye,
  Layers3,
  Palette,
  BadgeCheck,
  Copy,
} from "lucide-react";

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
  options: Array<{ value: string; label: string }>;
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

  const completedSteps = [isPackageStructureComplete, isPackageMaterialComplete, isPackagePrintComplete].filter(Boolean).length;
  const selectionLabel =
    selectedConfiguratorProduct?.productLabel ??
    [selectedTypeName, selectedKindName, selectedModelName].filter(Boolean).join(" / ");

  return (
    <div className="space-y-6 rounded-[22px] border border-border/40 bg-background/30 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Пакет
          </div>
          <div className="text-base font-semibold text-foreground">{selectionLabel || "Конфігурація пакета"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Конструкція", done: isPackageStructureComplete },
            { label: "Матеріал", done: isPackageMaterialComplete },
            { label: "Друк", done: isPackagePrintComplete },
          ].map((step) => (
            <div
              key={step.label}
              className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground"
            >
              {step.done ? <CheckCircle2 className="h-3.5 w-3.5 text-foreground" /> : <CircleDashed className="h-3.5 w-3.5" />}
              <span className={step.done ? "text-foreground" : undefined}>{step.label}</span>
            </div>
          ))}
          <div className="inline-flex items-center rounded-full border border-border/50 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground">
            {completedSteps}/3
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
            icon={<Package />}
          />
        </ConfigField>

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

      <div className="grid gap-4 border-t border-border/40 pt-5 md:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid gap-4 border-t border-border/40 pt-5 md:grid-cols-2 xl:grid-cols-4">
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
    </div>
  );
}
