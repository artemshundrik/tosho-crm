import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { scoreCompanyNameMatch } from "@/lib/companyNameSearch";

import { catalogPlace } from "./catalogPlace";
import { PrintModelArt } from "./printModelArt";
import type { CatalogSuggestion } from "./catalogSuggestions";

/**
 * Рейка видів поліграфії замість пошуку по каталогу (11.09.2026).
 *
 * ЩО ЦЕ ЛІКУЄ. Під «Поліграфією» те саме поле шукало по всьому каталогу разом
 * із товарами постачальників: на слово «щоденник» приходило 24 готові
 * щоденники з фото й цінами і одна наша модель без фото. Менеджер брав
 * перший-ліпший — а на ньому немає опису полів виробу, тож чекліст не
 * з'являвся, і Таня отримувала «щоденник, 500 шт».
 *
 * ЧОМУ РЕЙКА, А НЕ СІТКА. Менеджер робить тут рівно два вибори: вид і тираж.
 * Види займають один рядок угорі й гортаються вбік, а вся решта висоти
 * належить позиціям — їх у прорахунку буває десяток, і саме вони ростуть.
 *
 * ЧОМУ ПОЗИЦІЇ МАЛЮЄ НЕ ЦЕЙ КОМПОНЕНТ. Обраний вид стає такою самою
 * чернеткою, як товар: ті самі рядки, ті самі тиражі, та сама кнопка
 * видалення. Другий вигляд рядка позиції означав би дві правди про одне й те
 * саме — і поліграфія виглядала б чужою у власному вікні.
 *
 * МЕЖА ТУТ НЕ КОСМЕТИЧНА, а рішення Олени (REQ-36#p36): повний чекліст — лише
 * для того, що робимо під замовника; у готового щоденника з Е-Сувеніра
 * питаємо тільки нанесення, і його місце в «Товарі».
 *
 * Порожній список означає, що жодній моделі не проставили `specPreset`, — тоді
 * компонент не малює нічого, а вікно лишає звичайне поле: краще старий шлях,
 * ніж екран без жодного способу додати позицію.
 */

/**
 * Від скількох видів з'являється пошук. Сім штук перебираються оком швидше,
 * ніж набирається слово, і поле над ними було б шумом; коли видів стане
 * більше за екран, пошук з'явиться сам, без правки коду.
 */
const SEARCH_FROM = 9;

export type PrintModelPickerProps = {
  suggestions: CatalogSuggestion[];
  onPick: (suggestion: CatalogSuggestion) => void;
  /** `modelId` видів, які вже стоять у чернетках — щоб показати «додано». */
  addedModelIds?: ReadonlySet<string>;
  disabled?: boolean;
};

/** Наші друковані моделі — ті, у яких є опис полів виробу. */
export const selectPrintModels = (suggestions: CatalogSuggestion[]): CatalogSuggestion[] =>
  suggestions
    .filter((suggestion) => Boolean(suggestion.specPreset))
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));

export function PrintModelPicker({ suggestions, onPick, addedModelIds, disabled }: PrintModelPickerProps) {
  const models = React.useMemo(() => selectPrintModels(suggestions), [suggestions]);
  const [query, setQuery] = React.useState("");

  const shown = React.useMemo(() => {
    const needle = query.trim();
    if (!needle) return models;
    // Шукаємо і за назвою виду, і за назвою вигляду з типом: менеджер думає
    // «календар», а моделі звуться «Квартальний», «Перекидний», «Хатинка».
    return models.filter((model) => scoreCompanyNameMatch(needle, [model.name, model.kindName, model.typeName]) > 0);
  }, [models, query]);

  if (models.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {models.length >= SEARCH_FROM ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled}
            placeholder="Знайти вид"
            className="h-9 bg-background/60 pl-9"
          />
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
          Такого виду немає. Готове від постачальника шукайте в «Товарі».
        </div>
      ) : (
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {shown.map((model) => {
            const added = Boolean(model.modelId && addedModelIds?.has(model.modelId));
            return (
              <button
                key={model.modelId ?? model.name}
                type="button"
                disabled={disabled}
                // Вибрав раз — і досить (REQ-178#p20): другий клік по тому
                // самому виду давав другу таку саму позицію, і людина бачила
                // це вже в списку, а не в мить кліку.
                onClick={() => {
                  if (added) return;
                  onPick(model);
                }}
                title={catalogPlace(model.kindName, model.typeName)}
                className={cn(
                  "flex h-[104px] w-[104px] shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-xl border px-2 text-center transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  // Монохром: вибране позначає контур і тон підкладки, не колір.
                  added
                    ? "border-foreground/60 bg-muted/60 text-foreground"
                    : "border-border/50 bg-background/60 text-muted-foreground hover:border-border hover:bg-muted/40"
                )}
              >
                <PrintModelArt presetKey={model.specPreset} className="text-foreground/70" />
                <span className="line-clamp-2 text-2xs font-semibold leading-tight text-foreground">
                  {model.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

    </div>
  );
}
