import * as React from "react";
import { Check, RefreshCw, Search } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCatalogSkuMatches } from "@/features/quotes/quote-wizard/catalogSkuSearch";
import {
  rankCatalogSuggestions,
  type CatalogSuggestion,
} from "@/features/quotes/quote-wizard/catalogSuggestions";
import { useCatalogSuggestions } from "@/features/quotes/quote-wizard/useCatalogSuggestions";
import type { QuoteItemMetadata } from "@/lib/printPackage";

import { buildModelSwapPatch } from "./modelSwapPatch";

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
 * ВІКНО, А НЕ ПОПОВЕР (Артем, 11.09.2026). Дія переїхала в меню «⋮», де вже
 * живе «Видалити»: заради однієї пунктирної кнопки картка тримала цілу смугу під
 * назвою, а в поліграфії ця смуга взагалі стояла порожня — нанесення там не
 * питають. Поповер не можна відкрити з пункта меню (два накладені шари Radix
 * б'ються за фокус), тож пошук лишився той самий, а оболонка стала вікном.
 *
 * ВЛАСНА КНОПКА ЛИШИЛАСЬ для тих, хто відкриває компонент напряму: якщо `open`
 * не передали, він так само вміє бути самостійним чипом.
 *
 * ЗАМІНА МОДЕЛІ НЕ ЧІПАЄ ТИРАЖІ Й ЦІНИ: міняється товар, а не те, скільки
 * його й почім. А от нанесення при зміні ВИДУ стирається — методи належать
 * виду (`catalog_methods.kind_id`), і чужі id у позиції були б брехнею, яку
 * не побачить ні картка, ні дизайн-задача, ні замовлення.
 *
 * ПАРАМЕТРИ ВИРОБУ ЗЛІТАЮТЬ ІЗ ТІЄЇ Ж ПРИЧИНИ (REQ-36#p41). Пресет належить
 * МОДЕЛІ (`catalog_models.metadata.specPreset`), тож після заміни щоденника на
 * брошуру збережені 33 поля щоденника описують товар, якого в позиції вже
 * немає. Раніше вони лишались, і панель показувала їх далі — мовчки, бо брала
 * пресет із збереженого значення, а не з моделі. Питати підтвердження не
 * стали: нанесення поруч злітають без питання з тієї самої причини, і два
 * різні правила на одну дію плутали б більше, ніж рятували.
 */
export function QuoteItemModelSwap({
  teamId,
  itemId,
  currentModelId,
  currentKindId,
  disabled,
  metadata,
  onSaved,
  open: openProp,
  onOpenChange,
}: {
  teamId: string;
  itemId: string;
  currentModelId: string | null;
  currentKindId: string | null;
  disabled?: boolean;
  /** Метадані позиції: із них при зміні виду знімаються параметри виробу. */
  metadata?: QuoteItemMetadata | null;
  onSaved?: () => void;
  /** Керований стан — коли вікно відкриває меню «⋮». Без нього малюється власний чип. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openSelf, setOpenSelf] = React.useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openSelf;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlled) onOpenChange?.(next);
      else setOpenSelf(next);
      if (!next) setQuery("");
    },
    [controlled, onOpenChange]
  );
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
    await updateQuoteItemRow(
      itemId,
      buildModelSwapPatch(suggestion, { currentKindId, metadata: metadata ?? null })
    );
    setSaving(false);
    setQuery("");
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlled ? null : (
        <DialogTrigger asChild>
          <Chip size="sm" disabled={disabled || saving} icon={<RefreshCw />} className="border-dashed text-muted-foreground">
            замінити товар
          </Chip>
        </DialogTrigger>
      )}
      {/* Вибір із каталогу нічого не втрачає: клік повз — це «передумав». */}
      <DialogContent dismissible className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Замінити товар</DialogTitle>
          <DialogDescription>
            Тиражі й ціни лишаться як є. Якщо зміниться вид — нанесення доведеться поставити заново.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3">
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
        <div className="-mx-1 max-h-72 overflow-y-auto px-1">
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
                  {suggestion.matched ? ` · арт. ${suggestion.matched.sku}` : ""}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
