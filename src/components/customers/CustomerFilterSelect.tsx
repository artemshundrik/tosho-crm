import * as React from "react";
import { ChevronDown, Check } from "@/components/icons/appIcons";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TOOLBAR_CONTROL_ACTIVE,
  TOOLBAR_FILTER,
} from "@/components/ui/controlStyles";
import {
  searchQuoteParties,
  type QuotePartyOption,
} from "@/features/quotes/quoteParties";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import type { CustomerFilterValue } from "@/lib/customerFilter";
import { cn } from "@/lib/utils";

type CustomerFilterSelectProps = {
  teamId: string | null | undefined;
  value: CustomerFilterValue | null;
  onChange: (value: CustomerFilterValue | null) => void;
  className?: string;
};

const partyKind = (party: QuotePartyOption): "customer" | "lead" =>
  party.entityType ?? "customer";

/**
 * Фільтр за замовником для тулбарів: кнопка як у `ToolbarFilterSelect`, усередині
 * пошук і список замовників та лідів. Список бере `quoteParties` — він вантажить
 * обидві таблиці раз і фільтрує в браузері, тож літера в пошуку не б'є в базу.
 */
export function CustomerFilterSelect({
  teamId,
  value,
  onChange,
  className,
}: CustomerFilterSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [parties, setParties] = React.useState<QuotePartyOption[]>([]);
  const [highlight, setHighlight] = React.useState(0);
  const [selectedLogo, setSelectedLogo] = React.useState<string | null>(null);
  const isNarrow = useIsNarrowViewport();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const valueId = value?.id ?? null;
  const valueName = value?.name ?? "";
  React.useEffect(() => {
    if (!teamId || !valueId) {
      setSelectedLogo(null);
      return;
    }
    let cancelled = false;
    void searchQuoteParties(teamId, valueName)
      .then((found) => {
        if (!cancelled)
          setSelectedLogo(
            found.find((party) => party.id === valueId)?.logo_url ?? null,
          );
      })
      .catch(() => {
        if (!cancelled) setSelectedLogo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, valueId, valueName]);

  React.useEffect(() => {
    if (!open || !teamId) return;
    let cancelled = false;
    void searchQuoteParties(teamId, search)
      .then((found) => {
        if (cancelled) return;
        setParties(found);
        setHighlight(0);
      })
      .catch(() => {
        if (!cancelled) setParties([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, search, teamId]);

  // Рядок скидання стоїть угорі, поки нічого не набрано.
  const showReset = search.trim().length === 0;
  const itemCount = parties.length + (showReset ? 1 : 0);

  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  // Аркуш на телефоні сам віддає фокус хрестику, тож поле беремо вручну.
  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSearch("");
      setHighlight(0);
    }
  };

  const pick = (index: number) => {
    const offset = showReset ? 1 : 0;
    if (showReset && index === 0) {
      onChange(null);
    } else {
      const party = parties[index - offset];
      if (!party) return;
      onChange({
        kind: partyKind(party),
        id: party.id,
        name: party.name?.trim() || party.legal_name?.trim() || "Без назви",
        legalName: party.legal_name ?? null,
      });
    }
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) =>
        itemCount === 0 ? 0 : (current + 1) % itemCount,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) =>
        itemCount === 0 ? 0 : (current - 1 + itemCount) % itemCount,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (itemCount > 0) pick(highlight);
    }
  };

  const active = value !== null;
  const rowClass = (index: number) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] outline-none",
      isNarrow && "min-h-11 text-sm",
      index === highlight
        ? "bg-accent text-accent-foreground"
        : "hover:bg-accent/60",
    );

  const trigger = (
    <Button
      type="button"
      variant="outline"
      aria-label="Замовник"
      onClick={isNarrow ? () => handleOpenChange(true) : undefined}
      className={cn(
        TOOLBAR_FILTER,
        "min-w-0 justify-between sm:w-[200px]",
        isNarrow && "w-full",
        className,
        active && TOOLBAR_CONTROL_ACTIVE,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {value ? (
          <EntityAvatar
            src={selectedLogo}
            name={value.name}
            size={20}
            className="shrink-0 border-border/50"
            fallbackClassName="text-3xs font-semibold"
          />
        ) : null}
        <span className="truncate">{value ? value.name : "Всі замовники"}</span>
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </Button>
  );

  const searchInput = (
    <Input
      ref={inputRef}
      autoFocus
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder="Пошук замовника"
      aria-label="Пошук замовника"
      controlSize={isNarrow ? "lg" : undefined}
      className={isNarrow ? "text-base" : undefined}
    />
  );

  const list = (
    <div
      ref={listRef}
      role="listbox"
      className={cn(
        "space-y-0.5 overflow-y-auto overscroll-contain",
        isNarrow ? "min-h-0 flex-1" : "max-h-[min(19rem,50vh)]",
      )}
      onWheelCapture={(event) => event.stopPropagation()}
    >
      {showReset ? (
        <button
          type="button"
          role="option"
          aria-selected={!value}
          data-index={0}
          className={rowClass(0)}
          onMouseEnter={() => setHighlight(0)}
          onClick={() => pick(0)}
        >
          <Check
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              value ? "opacity-0" : "opacity-100",
            )}
          />
          <span className="min-w-0 flex-1 truncate">Всі замовники</span>
        </button>
      ) : null}
      {parties.map((party, partyIndex) => {
        const index = partyIndex + (showReset ? 1 : 0);
        const kind = partyKind(party);
        const label =
          party.name?.trim() || party.legal_name?.trim() || "Без назви";
        const selected = value?.id === party.id;
        return (
          <button
            key={`${kind}-${party.id}`}
            type="button"
            role="option"
            aria-selected={selected}
            data-index={index}
            className={rowClass(index)}
            onMouseEnter={() => setHighlight(index)}
            onClick={() => pick(index)}
          >
            <EntityAvatar
              src={party.logo_url ?? null}
              name={label}
              size={24}
              className="shrink-0 border-border/50"
              fallbackClassName="text-3xs font-semibold"
            />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {kind === "lead" ? (
              <span className="cmd-kind-lead inline-flex h-4.5 shrink-0 items-center rounded-full border px-2 text-3xs font-semibold uppercase leading-none tracking-wide">
                Лід
              </span>
            ) : null}
            {selected ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : null}
          </button>
        );
      })}
      {parties.length === 0 && !showReset ? (
        <div className="p-2 text-xs text-muted-foreground">
          Нічого не знайдено
        </div>
      ) : null}
    </div>
  );

  if (isNarrow) {
    return (
      <>
        {trigger}
        <BottomSheet
          open={open}
          onOpenChange={handleOpenChange}
          title="Замовник"
          className="h-[70dvh]"
          contentClassName="flex flex-col gap-2 overflow-hidden"
        >
          {searchInput}
          {list}
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-2">
        <div className="space-y-2">
          {searchInput}
          {list}
        </div>
      </PopoverContent>
    </Popover>
  );
}
