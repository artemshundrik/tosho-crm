import * as React from "react";
import { Building2, Check, Lock } from "lucide-react";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { matchesCompanyNameSearch } from "@/lib/companyNameSearch";
import { cn } from "@/lib/utils";

export type CustomerLeadOption = {
  id: string;
  label: string;
  entityType: "customer" | "lead";
  logoUrl?: string | null;
  legalName?: string | null;
  managerLabel?: string | null;
  searchText?: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
};

export type CustomerLeadPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLabel: string;
  selectedType?: "customer" | "lead";
  selectedLogoUrl?: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  options: CustomerLeadOption[];
  loading?: boolean;
  onSelect: (option: CustomerLeadOption) => void;
  onCreateCustomer?: (name: string) => void;
  onCreateLead?: (name: string) => void;
  onClear?: () => void;
  chipLabel?: string;
  popoverClassName?: string;
  align?: "start" | "center" | "end";
  maxVisible?: number;
};

export const CustomerLeadPicker: React.FC<CustomerLeadPickerProps> = ({
  open,
  onOpenChange,
  selectedLabel,
  selectedType = "customer",
  selectedLogoUrl,
  searchValue,
  onSearchChange,
  options,
  loading = false,
  onSelect,
  onCreateCustomer,
  onCreateLead,
  onClear,
  chipLabel = "Замовник / Лід",
  popoverClassName = "w-80 p-2",
  align = "start",
  maxVisible = 50,
}) => {
  const search = searchValue.trim();
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [showTopFade, setShowTopFade] = React.useState(false);
  const [showBottomFade, setShowBottomFade] = React.useState(false);
  const selectedOption = React.useMemo(
    () =>
      options.find((option) => option.label === selectedLabel.trim() && option.entityType === selectedType) ?? null,
    [options, selectedLabel, selectedType]
  );
  const chipLogoUrl = selectedLogoUrl ?? selectedOption?.logoUrl ?? null;
  const chipLabelText = selectedLabel.trim();
  const visibleOptions = React.useMemo(() => {
    if (!search) return options.slice(0, maxVisible);
    return options
      .filter((option) =>
        matchesCompanyNameSearch(search, [option.label, option.legalName ?? null, option.searchText ?? null])
      )
      .slice(0, maxVisible);
  }, [maxVisible, options, search]);
  const canCreate = Boolean(searchValue.trim());
  const canScroll = !loading && visibleOptions.length > 0;

  const updateScrollHints = React.useCallback(() => {
    const node = listRef.current;
    if (!node) {
      setShowTopFade(false);
      setShowBottomFade(false);
      return;
    }
    const maxScrollTop = node.scrollHeight - node.clientHeight;
    if (maxScrollTop <= 1) {
      setShowTopFade(false);
      setShowBottomFade(false);
      return;
    }
    setShowTopFade(node.scrollTop > 2);
    setShowBottomFade(node.scrollTop < maxScrollTop - 2);
  }, []);

  React.useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = 0;
    updateScrollHints();
  }, [open, searchValue, visibleOptions.length, loading, updateScrollHints]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Chip
          size="md"
          icon={
            chipLabelText ? (
              <EntityAvatar
                src={chipLogoUrl}
                name={chipLabelText}
                size={22}
                className="border-border/50"
                fallbackClassName="text-[9px] font-semibold"
              />
            ) : (
              <Building2 className="h-4 w-4" />
            )
          }
          active={!!chipLabelText}
          className={cn(chipLabelText ? "max-w-[22rem] gap-2 pr-4" : undefined)}
        >
          {chipLabelText
            ? `${selectedType === "lead" ? "Лід: " : ""}${chipLabelText}`
            : chipLabel}
        </Chip>
      </PopoverTrigger>
      <PopoverContent className={popoverClassName} align={align}>
        <div className="space-y-2">
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Пошук замовника або ліда..."
            className="h-9"
          />
          <div className="relative">
            <div
              ref={listRef}
              className="max-h-[min(19rem,50vh)] overflow-y-auto overscroll-contain space-y-1"
              onWheelCapture={(event) => event.stopPropagation()}
              onScroll={updateScrollHints}
            >
              {loading ? (
                <div className="p-2 text-xs text-muted-foreground">Завантаження...</div>
              ) : visibleOptions.length > 0 ? (
                visibleOptions.map((option) => {
                  const isSelected = selectedLabel.trim() === option.label && selectedType === option.entityType;
                  return (
                    <Button
                      key={`${option.entityType}-${option.id}`}
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={option.disabled}
                      className={cn(
                        "h-auto min-h-12 w-full items-center justify-start gap-3 rounded-[var(--radius-lg)] px-2 py-2 text-left text-sm",
                        option.disabled && "cursor-not-allowed opacity-55"
                      )}
                      onClick={() => {
                        if (option.disabled) return;
                        onSelect(option);
                        onOpenChange(false);
                      }}
                      title={option.disabledReason || option.label}
                    >
                      <EntityAvatar
                        src={option.logoUrl ?? null}
                        name={option.label}
                        size={36}
                        className="shrink-0 border-border/50"
                        fallbackClassName="text-[10px] font-semibold"
                      />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-sm font-medium leading-5 text-foreground">{option.label}</span>
                        {option.managerLabel ? (
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            Менеджер: {option.managerLabel}
                          </span>
                        ) : null}
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex h-4.5 items-center rounded-full border px-2 text-[9px] font-semibold uppercase tracking-wide",
                              option.entityType === "lead"
                                ? "border-amber-300 bg-amber-100 text-amber-950"
                                : "border-emerald-300 bg-emerald-100 text-emerald-950"
                            )}
                          >
                            {option.entityType === "lead" ? "Лід" : "Замовник"}
                          </span>
                          {option.disabled ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              Недоступно
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <Check className={cn("ml-auto h-3.5 w-3.5 text-primary", isSelected ? "opacity-100" : "opacity-0")} />
                    </Button>
                  );
                })
              ) : search ? (
                <div className="p-2 text-xs text-muted-foreground">Замовників або лідів не знайдено</div>
              ) : (
                <div className="p-2 text-xs text-muted-foreground">Введіть назву для пошуку</div>
              )}
            </div>
            {canScroll && showTopFade ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-popover to-transparent" />
            ) : null}
            {canScroll && showBottomFade ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-popover to-transparent" />
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-1">
            {onCreateCustomer ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={cn("h-8 w-full", !onCreateLead && "col-span-2")}
                disabled={!canCreate}
                onClick={() => {
                  onCreateCustomer(searchValue.trim());
                  onOpenChange(false);
                }}
              >
                Новий замовник
              </Button>
            ) : null}
            {onCreateLead ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn("h-8 w-full", !onCreateCustomer && "col-span-2")}
                disabled={!canCreate}
                onClick={() => {
                  onCreateLead(searchValue.trim());
                  onOpenChange(false);
                }}
              >
                Новий лід
              </Button>
            ) : null}
            {selectedLabel.trim() && onClear ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="col-span-2 h-8 w-full text-muted-foreground"
                onClick={() => {
                  onClear();
                  onOpenChange(false);
                }}
              >
                Очистити
              </Button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
