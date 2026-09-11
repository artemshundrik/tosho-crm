import * as React from "react";
import { Printer } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CatalogSuggestion } from "./catalogSuggestions";

/**
 * Вибір поліграфії картками замість пошуку (11.09.2026).
 *
 * ЩО ЦЕ ЛІКУЄ. Під «Поліграфією» те саме поле шукало по всьому каталогу разом
 * із товарами постачальників: на слово «щоденник» приходило 24 готові
 * щоденники з картинками й цінами і одна наша модель без фото. Менеджер
 * природно брав перший-ліпший — а на ньому немає опису полів виробу, тож
 * чекліст не з'являвся взагалі, і Таня отримувала «щоденник, 500 шт».
 *
 * ЧОМУ КАРТКИ, А НЕ ФІЛЬТР ПОШУКУ. Того, що ми виробляємо самі, одиниці —
 * шість моделей на 11.09. Шукати серед шести нема чого: список коротший за
 * підказку, яку той пошук видає. Пошук лишається для «Товару», де каталог на
 * 244 моделі.
 *
 * МЕЖА ТУТ НЕ КОСМЕТИЧНА, а рішення Олени (REQ-36#p36): повний чекліст — лише
 * для того, що робимо під замовника; у готового щоденника з Е-Сувеніра питаємо
 * тільки нанесення, і його місце в «Товарі».
 *
 * Порожній список означає, що жодній моделі не проставили `specPreset`, — тоді
 * компонент не малює нічого, а вікно лишає звичайне поле: краще старий шлях,
 * ніж екран без жодного способу додати позицію.
 */

export type PrintModelPickerProps = {
  suggestions: CatalogSuggestion[];
  onPick: (suggestion: CatalogSuggestion) => void;
  disabled?: boolean;
};

/** Наші друковані моделі — ті, у яких є опис полів виробу. */
export const selectPrintModels = (suggestions: CatalogSuggestion[]): CatalogSuggestion[] =>
  suggestions
    .filter((suggestion) => Boolean(suggestion.specPreset))
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));

export function PrintModelPicker({ suggestions, onPick, disabled }: PrintModelPickerProps) {
  const models = React.useMemo(() => selectPrintModels(suggestions), [suggestions]);
  if (models.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        {models.map((model) => (
          <button
            key={model.modelId ?? model.name}
            type="button"
            disabled={disabled}
            onClick={() => onPick(model)}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border/50 bg-background/60 px-3.5 py-3 text-left transition-colors",
              "hover:border-primary/40 hover:bg-primary/5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Printer className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">{model.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {model.kindName} · {model.typeName}
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Це те, що виробляємо під замовника. Готовий щоденник чи блокнот від постачальника шукайте в «Товарі» — там
        питаємо тільки нанесення.
      </p>
    </div>
  );
}
