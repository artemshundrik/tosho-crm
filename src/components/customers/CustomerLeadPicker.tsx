import * as React from "react";
import { Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CustomerLeadOption = {
  id: string;
  label: string;
  entityType: "customer" | "lead";
  logoUrl?: string | null;
};

export type CustomerLeadPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLabel: string;
  selectedType?: "customer" | "lead";
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
  searchValue,
  onSearchChange,
  options,
  loading = false,
  onSelect,
  onCreateCustomer,
  onCreateLead,
  onClear,
  chipLabel = "Клієнт / Лід",
  popoverClassName = "w-80 p-2",
  align = "start",
  maxVisible = 50,
}) => {
  const search = searchValue.trim().toLowerCase();
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [showTopFade, setShowTopFade] = React.useState(false);
  const [showBottomFade, setShowBottomFade] = React.useState(false);
  const visibleOptions = React.useMemo(() => {
    if (!search) return options.slice(0, maxVisible);
    return options.filter((option) => option.label.toLowerCase().includes(search)).slice(0, maxVisible);
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
        <Chip size="md" icon={<Building2 className="h-4 w-4" />} active={!!selectedLabel.trim()}>
          {selectedLabel.trim()
            ? `${selectedType === "lead" ? "Лід: " : ""}${selectedLabel.trim()}`
            : chipLabel}
        </Chip>
      </PopoverTrigger>
      <PopoverContent className={popoverClassName} align={align}>
        <div className="space-y-2">
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Пошук клієнта або ліда..."
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
                      className="h-9 w-full justify-start gap-2 text-sm"
                      onClick={() => {
                        onSelect(option);
                        onOpenChange(false);
                      }}
                      title={option.label}
                    >
                      <span className="inline-flex items-center gap-2 truncate">
                        <span
                          className={cn(
                            "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide",
                            option.entityType === "lead"
                              ? "border-amber-300 bg-amber-100 text-amber-950"
                              : "border-emerald-300 bg-emerald-100 text-emerald-950"
                          )}
                        >
                          {option.entityType === "lead" ? "Лід" : "Клієнт"}
                        </span>
                        <span className="truncate">{option.label}</span>
                      </span>
                      <Check className={cn("ml-auto h-3.5 w-3.5 text-primary", isSelected ? "opacity-100" : "opacity-0")} />
                    </Button>
                  );
                })
              ) : search ? (
                <div className="p-2 text-xs text-muted-foreground">Клієнтів або лідів не знайдено</div>
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
                Новий клієнт
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
