import * as React from "react";
import { Building2, Check, Lock, Plus } from "@/components/icons/appIcons";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { matchesCompanyNameSearch } from "@/lib/companyNameSearch";
import { cn } from "@/lib/utils";
import { MenuSkeleton } from "@/components/app/loading-primitives";

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
    // For 1-2 char queries the server already runs a prefix match (with
    // Latin↔Cyrillic transliteration). Trust it and skip the fuzzy client
    // filter — otherwise a single letter like "f" returns nothing.
    if (search.length < 3) return options.slice(0, maxVisible);
    return options
      .filter((option) =>
        matchesCompanyNameSearch(search, [option.label, option.legalName ?? null, option.searchText ?? null])
      )
      .slice(0, maxVisible);
  }, [maxVisible, options, search]);
  const canCreate = Boolean(searchValue.trim());
  const canScroll = !loading && visibleOptions.length > 0;
  /*
    «НЕ ЗНАЙДЕНО» — РОЗВИЛКА, А НЕ ГЛУХИЙ КУТ (REQ-301).

    Дотепер на місці списку стояв сірий рядок «Замовників або лідів не
    знайдено», а завести нового пропонували дві однакові кнопки в підвалі —
    тобто відповідь на «його ще немає» лежала не там, куди людина дивиться.
    У візарді прорахунку цих кнопок не було взагалі, і порожній пошук
    закінчувався нічим.

    Тепер пропозиція стоїть РІВНО на місці ненайденого: набране імʼя і два
    виходи. Підвал у цю мить свої кнопки ховає — двох однакових пропозицій
    в одному вікні бути не має.

    «Лід» головний навмисно: компанія, якої в базі ще немає, замовником поки
    не стала — вона щойно попросила прорахунок. Замовник лишається поруч для
    випадку, коли картку заводять уже на відому компанію.
  */
  const nothingFound = !loading && Boolean(search) && visibleOptions.length === 0;
  const canOfferCreate = Boolean(onCreateCustomer || onCreateLead);
  const offerCreateInstead = nothingFound && canOfferCreate;
  const showClear = Boolean(selectedLabel.trim()) && Boolean(onClear);
  // Порожній підвал малював саму лише лінію `border-t` — смужку нізвідки
  // під списком. Тепер підвала просто немає, коли в ньому нічого немає.
  const showFooter = (canOfferCreate && !offerCreateInstead) || showClear;

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
                fallbackClassName="text-3xs font-semibold"
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
          />
          <div className="relative">
            <div
              ref={listRef}
              className="max-h-[min(19rem,50vh)] overflow-y-auto overscroll-contain space-y-1"
              onWheelCapture={(event) => event.stopPropagation()}
              onScroll={updateScrollHints}
            >
              {loading ? (
                <MenuSkeleton rows={4} label="Завантажуємо замовників і лідів..." />
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
                          "h-auto min-h-12 w-full items-center justify-start gap-3 px-2 py-2 text-left text-sm",
                          option.disabled && "cursor-not-allowed opacity-55"
                        )}
                        // СИСТЕМНИЙ `title` ТУТ НАВМИСНО (REQ-175#p6): він
                        // пояснює, чому рядок не вибирається, а вимкнена кнопка
                        // подій миші не отримує — власна підказка на ній не
                        // відкрилась би ніколи. Ім'я рядка й так видно текстом.
                        title={option.disabledReason || undefined}
                        onClick={() => {
                          if (option.disabled) return;
                          onSelect(option);
                          onOpenChange(false);
                        }}
                      >
                        <EntityAvatar
                          src={option.logoUrl ?? null}
                          name={option.label}
                          size={36}
                          className="shrink-0 border-border/50"
                          fallbackClassName="text-3xs font-semibold"
                        />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-sm font-medium leading-5 text-foreground">{option.label}</span>
                          {option.managerLabel ? (
                            <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                              Менеджер: {option.managerLabel}
                            </span>
                          ) : null}
                          <span className="mt-0.5 flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex h-4.5 items-center justify-center rounded-full border px-2 text-3xs font-semibold uppercase leading-none tracking-wide",
                                option.entityType === "lead"
                                  ? "cmd-kind-lead"
                                  : "cmd-kind-customer"
                              )}
                            >
                              {option.entityType === "lead" ? "Лід" : "Замовник"}
                            </span>
                            {option.disabled ? (
                              <span className="inline-flex items-center gap-1 text-3xs font-medium text-muted-foreground">
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
              ) : offerCreateInstead ? (
                <div className="px-1 pb-1 pt-2 text-center">
                  <p className="truncate text-sm font-medium text-foreground" title={search}>
                    «{search}»
                  </p>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    Такого ще немає — заведіть картку
                  </p>
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {onCreateLead ? (
                      <Button
                        type="button"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => {
                          onCreateLead(search);
                          onOpenChange(false);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Створити ліда
                      </Button>
                    ) : null}
                    {onCreateCustomer ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5"
                        onClick={() => {
                          onCreateCustomer(search);
                          onOpenChange(false);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Створити замовника
                      </Button>
                    ) : null}
                  </div>
                </div>
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
          {showFooter ? (
          <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-1">
            {onCreateCustomer && !offerCreateInstead ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={cn("w-full", !onCreateLead && "col-span-2")}
                disabled={!canCreate}
                onClick={() => {
                  onCreateCustomer(searchValue.trim());
                  onOpenChange(false);
                }}
              >
                Новий замовник
              </Button>
            ) : null}
            {onCreateLead && !offerCreateInstead ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn("w-full", !onCreateCustomer && "col-span-2")}
                disabled={!canCreate}
                onClick={() => {
                  onCreateLead(searchValue.trim());
                  onOpenChange(false);
                }}
              >
                Новий лід
              </Button>
            ) : null}
            {showClear && onClear ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="col-span-2 w-full text-muted-foreground"
                onClick={() => {
                  onClear();
                  onOpenChange(false);
                }}
              >
                Очистити
              </Button>
            ) : null}
          </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
};
