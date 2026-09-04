import * as React from "react";
import { CornerDownLeft, Database, ImageOff, Link2, Loader2, Plus, Search } from "lucide-react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { normalizeProductUrl } from "@/features/quotes/quote-import/productUrl";
import { cn } from "@/lib/utils";

import { rankCatalogSuggestions, type CatalogSuggestion } from "./catalogSuggestions";

/**
 * Одне поле замість трьох вкладок (REQ-182#p14).
 *
 * ЩО ВОНО РОЗУМІЄ. Посилання — і поле каже «Посилання» праворуч: Enter додає
 * позицію, а сторінку читає розвідка. Будь-що інше — це назва, і поле каже
 * «З бази»: під ним підказки з каталогу, а останнім рядком «Додати як нову
 * позицію» — колишнє «руками», яке тепер не окремий шлях, а те, що лишається,
 * коли в базі такого немає.
 *
 * ЧОМУ БЕЗ ВКЛАДОК. Вкладки «Руками · Excel · Посилання» просили відповісти
 * «звідки», перш ніж сказати «що». А «що» саме й каже «звідки»: адреса видно
 * по собі, назва — теж. Перемикач між ними не ніс інформації, лише скидав
 * список позицій при кожному перемиканні.
 *
 * ФОКУС ЛИШАЄТЬСЯ В ПОЛІ. Підказки не забирають фокус ані при відкритті, ані
 * при кліку по рядку: після вибору менеджер одразу набирає наступний товар.
 * Стрілки ходять по рядках, Enter бере підсвічений, Esc ховає список, не
 * стираючи набраного.
 */

export type CommandFieldMode = "link" | "search";

/**
 * Чи це адреса. Приймаємо не лише `https://…`, а й те, як посилання виглядає в
 * чаті: `www.prom.ua/p123` і `prom.ua/p123` — менеджери копіюють їх без схеми.
 * Голий домен без шляху («prom.ua») — ні: це ще не товар, і назва «prom.ua»
 * у каталозі теоретично можлива.
 */
function looksLikeUrl(token: string): boolean {
  if (/^https?:\/\//i.test(token)) return true;
  if (/^www\./i.test(token)) return true;
  return /^[\w-]+(\.[\w-]+)+\/\S+/.test(token);
}

function withScheme(token: string): string {
  return /^https?:\/\//i.test(token) ? token : `https://${token}`;
}

export function detectCommandFieldMode(value: string): CommandFieldMode {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return "search";
  return tokens.some(looksLikeUrl) ? "link" : "search";
}

/**
 * Список адрес із того, що вставили: перенос, пробіл чи кома між ними —
 * менеджери копіюють посилання пачкою з листа. Рекламний хвіст зрізаємо тут,
 * бо далі ця адреса піде і в запит по фото, і в `metadata.supplierUrl`.
 */
export function parseCommandFieldLinks(value: string): { urls: string[]; bad: string | null } {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean);
  const urls: string[] = [];
  for (const token of tokens) {
    if (!looksLikeUrl(token)) return { urls, bad: token };
    const url = normalizeProductUrl(withScheme(token));
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { urls, bad: token };
    } catch {
      return { urls, bad: token };
    }
    if (!urls.includes(url)) urls.push(url);
  }
  return { urls, bad: null };
}

const MODE_LABELS: Record<CommandFieldMode, { label: string; icon: typeof Link2 }> = {
  link: { label: "Посилання", icon: Link2 },
  search: { label: "З бази", icon: Database },
};

export function QuoteItemCommandField({
  value,
  onValueChange,
  suggestions,
  suggestionsLoading,
  disabled,
  busy,
  hasDrafts,
  onPickCatalog,
  onAddLinks,
  onAddName,
  onInvalid,
}: {
  value: string;
  onValueChange: (next: string) => void;
  suggestions: CatalogSuggestion[];
  suggestionsLoading: boolean;
  disabled?: boolean;
  /** Розвідка посилань ще йде — крутилка праворуч, поле при цьому НЕ блокується. */
  busy?: boolean;
  hasDrafts: boolean;
  onPickCatalog: (suggestion: CatalogSuggestion) => void;
  onAddLinks: (urls: string[]) => void;
  onAddName: (name: string) => void;
  /** Що саме не схоже на посилання — вікно покаже це своєю смугою помилки. */
  onInvalid: (message: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const trimmed = value.trim();
  const mode = detectCommandFieldMode(value);
  const ranked = React.useMemo(
    () => (mode === "search" ? rankCatalogSuggestions(suggestions, trimmed) : []),
    [mode, suggestions, trimmed]
  );
  // Рядків у списку: підказки + «Додати як нову позицію» останнім.
  const rowCount = ranked.length + 1;
  const open = focused && !dismissed && mode === "search" && trimmed.length > 0;

  // Новий текст — новий список: підсвітка повертається на перший рядок, а
  // схований Esc список показується знову, бо людина продовжила набирати.
  React.useEffect(() => {
    setActive(0);
    setDismissed(false);
  }, [trimmed]);

  const commitName = () => {
    if (!trimmed) return;
    onAddName(trimmed);
    onValueChange("");
  };

  const commitLinks = () => {
    const { urls, bad } = parseCommandFieldLinks(value);
    if (bad) {
      // Одна адреса — кажемо, чого їй бракує; список — називаємо, який саме
      // рядок зайвий, бо решту вже впізнали як посилання.
      const single = value.trim().split(/[\s,]+/).filter(Boolean).length === 1;
      onInvalid(
        single
          ? "Це не схоже на посилання: потрібна адреса, що починається з http:// або https://."
          : `«${bad.slice(0, 60)}» не схоже на посилання — приберіть його зі списку.`
      );
      return;
    }
    if (urls.length === 0) return;
    onAddLinks(urls);
    onValueChange("");
  };

  const commitRow = (index: number) => {
    const suggestion = ranked[index];
    if (suggestion) {
      onPickCatalog(suggestion);
      onValueChange("");
    } else {
      commitName();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (mode === "link") commitLinks();
      else if (open) commitRow(active);
      else commitName();
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % rowCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + rowCount) % rowCount);
    } else if (event.key === "Escape") {
      // Esc ховає список, але НЕ закриває вікно: зупиняємо подію тут, інакше
      // діалог сприйме її як «закрити», і набране пропаде разом із вікном.
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    }
  };

  const ModeIcon = MODE_LABELS[mode].icon;
  const listId = React.useId();

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            // 44 px: вище за звичайне поле (40), бо це головний вхід вікна, а не
            // одне з полів форми. Той самий радіус і межа, що в решти полів.
            "flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 transition-colors",
            "focus-within:border-foreground/40 focus-within:ring-2 focus-within:ring-foreground/10",
            disabled && "opacity-60"
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={value}
            disabled={disabled}
            role="combobox"
            aria-label="Товар: посилання або назва"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              hasDrafts
                ? "Ще товар: посилання або назва з бази"
                : "Вставте посилання на товар або почніть писати назву — підкажемо з бази"
            }
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(event) => onValueChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
          />
          {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Читаю сторінку" /> : null}
          {/*
            Підпис праворуч — не кнопка, а відповідь поля на набране: «це я
            прочитаю як посилання» або «це шукаю в базі». Показується, щойно є
            що тлумачити; на порожньому полі йому нема про що казати.
          */}
          {trimmed ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
              aria-live="polite"
            >
              <ModeIcon className="h-3 w-3" />
              {MODE_LABELS[mode].label}
            </span>
          ) : null}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] p-1.5"
        // Фокус лишається в полі: список — це підказка до набору, а не форма.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Клік по рядку — «вибрати», а не «клікнули повз поле»: без цього
        // втрата фокуса закривала б список раніше, ніж клік доходив до рядка.
        onInteractOutside={(event) => {
          if (event.target instanceof Node && inputRef.current?.contains(event.target)) event.preventDefault();
        }}
      >
        <ul id={listId} role="listbox" aria-label="Підказки з каталогу" className="space-y-0.5">
          {suggestionsLoading && ranked.length === 0 ? (
            <li className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Читаю каталог…
            </li>
          ) : null}
          {ranked.map((suggestion, index) => (
            <li
              key={suggestion.modelId}
              role="option"
              aria-selected={active === index}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] px-2 py-1.5 text-sm",
                active === index ? "bg-muted" : "hover:bg-muted/50"
              )}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitRow(index)}
            >
              <SuggestionPhoto url={suggestion.imageUrl} name={suggestion.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{suggestion.name}</span>
                <span className="block truncate text-2xs text-muted-foreground">
                  {suggestion.kindName} · {suggestion.typeName}
                </span>
              </span>
              {active === index ? (
                <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              ) : null}
            </li>
          ))}
          {!suggestionsLoading && ranked.length === 0 ? (
            <li className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">У базі такого немає</li>
          ) : null}
          <li
            role="option"
            aria-selected={active === ranked.length}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] px-2 py-1.5 text-sm",
              ranked.length > 0 && "mt-1 border-t border-border/60 pt-2",
              active === ranked.length ? "bg-muted" : "hover:bg-muted/50"
            )}
            onMouseEnter={() => setActive(ranked.length)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commitRow(ranked.length)}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-dashed border-border text-muted-foreground">
              <Plus className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                Додати «<span className="font-medium">{trimmed}</span>» як нову позицію
              </span>
              <span className="block text-2xs text-muted-foreground">Без каталогу — назва й тираж, решта в картці</span>
            </span>
            {active === ranked.length ? (
              <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function SuggestionPhoto({ url, name }: { url: string | null; name: string }) {
  const base = "h-9 w-9 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-border/60 bg-background";
  if (!url) {
    return (
      <span className={cn(base, "grid place-items-center bg-muted/40")} aria-hidden>
        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/50" />
      </span>
    );
  }
  return <img src={url} alt={name} loading="lazy" className={cn(base, "object-contain")} />;
}
