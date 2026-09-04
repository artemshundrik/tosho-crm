import * as React from "react";
import { Check, RefreshCw, Search } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCatalogSkuMatches } from "@/features/quotes/quote-wizard/catalogSkuSearch";
import {
  rankCatalogSuggestions,
  type CatalogSuggestion,
} from "@/features/quotes/quote-wizard/catalogSuggestions";
import { useCatalogSuggestions } from "@/features/quotes/quote-wizard/useCatalogSuggestions";

import { updateQuoteItemRow } from "./queries";

/**
 * Заміна товару просто в картці позиції (REQ-157#p5).
 *
 * Вікно редагування прорахунку віддало продукцію вкладці «Товари»
 * (REQ-157#p2), а вікно позиції з меню «⋮» лишається для рідкісного — одиниці,
 * артикула, коментаря, вкладення. Найчастіше ж міняють САМ ТОВАР, і робиться
 * це тим самим пошуком по каталогу, що у вікні створення прорахунку: набрав
 * кілька літер — обрав модель.
 *
 * ЗАМІНА МОДЕЛІ НЕ ЧІПАЄ ТИРАЖІ Й ЦІНИ: міняється товар, а не те, скільки
 * його й почім. А от нанесення при зміні ВИДУ стирається — методи належать
 * виду (`catalog_methods.kind_id`), і чужі id у позиції були б брехнею, яку
 * не побачить ні картка, ні дизайн-задача, ні замовлення.
 */
export function QuoteItemModelSwap({
  teamId,
  itemId,
  currentModelId,
  currentKindId,
  disabled,
  onSaved,
}: {
  teamId: string;
  itemId: string;
  currentModelId: string | null;
  currentKindId: string | null;
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { suggestions } = useCatalogSuggestions(teamId, open);
  // Той самий пошук за артикулом, що й у вікні створення (REQ-248): менеджер
  // міняє товар тим самим кодом від постачальника, яким його й додавав.
  const { matches: skuMatches, searching: skuSearching } = useCatalogSkuMatches(teamId, open ? query : "");
  const found = React.useMemo(
    () => rankCatalogSuggestions(suggestions, query, undefined, skuMatches),
    [suggestions, query, skuMatches]
  );

  const pick = async (suggestion: CatalogSuggestion) => {
    setSaving(true);
    setOpen(false);
    const kindChanged = suggestion.kindId !== currentKindId;
    await updateQuoteItemRow(itemId, {
      name: suggestion.name,
      catalog_type_id: suggestion.typeId,
      catalog_kind_id: suggestion.kindId,
      catalog_model_id: suggestion.modelId,
      ...(kindChanged ? { methods: null, print_position_id: null } : {}),
    });
    setSaving(false);
    setQuery("");
    onSaved?.();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Chip size="sm" disabled={disabled || saving} icon={<RefreshCw />} className="border-dashed text-muted-foreground">
          замінити товар
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        <div className="flex items-center gap-2 px-1.5 pb-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            autoFocus
            controlSize="md"
            aria-label="Пошук товару в каталозі"
            placeholder="Назва або артикул…"
            className="border-0 bg-transparent px-0 focus-visible:ring-0"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {found.map((suggestion) => (
            <button
              key={suggestion.modelId ?? suggestion.name}
              type="button"
              role="option"
              aria-selected={suggestion.modelId === currentModelId}
              onClick={() => void pick(suggestion)}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left hover:bg-muted/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{suggestion.name}</span>
                <span className="block truncate text-2xs text-muted-foreground">
                  {suggestion.kindName} · {suggestion.typeName}
                  {/* Знайшли за кодом — показуємо, ЗА ЯКИМ саме: у моделі їх
                      стільки ж, скільки кольорів (REQ-248). */}
                  {suggestion.matchedSku ? ` · арт. ${suggestion.matchedSku}` : ""}
                  {suggestion.modelId === currentModelId ? " · зараз обраний" : ""}
                </span>
              </span>
              {suggestion.modelId === currentModelId ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          ))}
          {skuSearching && found.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Шукаю за артикулом…</p>
          ) : null}
          {query.trim() && !skuSearching && found.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Нічого не знайшли. Товар заводять у «Каталозі» або посиланням у вікні створення.
            </p>
          ) : null}
          {!query.trim() ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Заміна не чіпає тиражі й ціни. Якщо вид зміниться — нанесення доведеться поставити заново.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
