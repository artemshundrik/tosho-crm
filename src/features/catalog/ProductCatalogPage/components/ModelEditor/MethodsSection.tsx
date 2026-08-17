/**
 * MethodsSection Component
 *
 * Вибір методів нанесення для моделі + додавання нових.
 *
 * Поле спершу ШУКАЄ і лише потім пропонує створити. Доти воно було просто
 * полем вводу з кнопкою «Додати», і кожен, хто не бачив уже наявного «УФ-друк»,
 * заводив свій: «УФ - друк», «уф друк», «Уф- друк», «УФ дрк». Тепер набране
 * одразу звіряється з методами цього виду і зі спільним довідником CRM, а
 * кнопка створення з'являється, лише коли збігу справді немає.
 */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, Coins, Plus, Search } from "lucide-react";
import { useMemo } from "react";
import type { CatalogMethod, MethodDirectoryEntry } from "@/types/catalog";
import { findSimilarMethods, normalizeMethodName } from "@/lib/catalogMethodName";

interface MethodsSectionProps {
  draftKindId: string;
  draftKindName?: string;
  availableMethods: CatalogMethod[];
  methodDirectory: MethodDirectoryEntry[];
  selectedMethodIds: string[];
  newMethodName: string;
  newMethodPrice: string;
  methodSaving: boolean;
  methodError: string | null;
  onMethodNameChange: (value: string) => void;
  onMethodPriceChange: (value: string) => void;
  onAddMethod: (kindId?: string, name?: string, directoryId?: string | null) => void;
  onToggleMethod: (methodId: string) => void;
}

export function MethodsSection({
  draftKindId,
  draftKindName,
  availableMethods,
  methodDirectory,
  selectedMethodIds,
  newMethodName,
  newMethodPrice,
  methodSaving,
  methodError,
  onMethodNameChange,
  onMethodPriceChange,
  onAddMethod,
  onToggleMethod,
}: MethodsSectionProps) {
  void newMethodPrice;
  void onMethodPriceChange;

  const query = newMethodName.trim();
  const queryKey = normalizeMethodName(query);

  /** Метод із таким самим ключем уже увімкнено для цього виду. */
  const exactHere = useMemo(
    () => availableMethods.find((method) => normalizeMethodName(method.name) === queryKey),
    [availableMethods, queryKey]
  );

  /** Схоже з довідника, чого в цьому виді ще немає — це і є «не плоди дубль». */
  const suggestions = useMemo(() => {
    if (!queryKey) return [];
    const hereKeys = new Set(availableMethods.map((method) => normalizeMethodName(method.name)));
    return findSimilarMethods(
      query,
      methodDirectory.filter((entry) => entry.active && !hereKeys.has(normalizeMethodName(entry.name)))
    );
  }, [availableMethods, methodDirectory, query, queryKey]);

  /** Точний збіг у довіднику: створювати нічого не треба, лише увімкнути виду. */
  const exactInDirectory = suggestions.find(
    (entry) => normalizeMethodName(entry.name) === queryKey
  );

  const canCreate = Boolean(queryKey) && !exactHere && !exactInDirectory;

  const visibleMethods = useMemo(() => {
    if (!queryKey) return availableMethods;
    const matched = availableMethods.filter((method) =>
      normalizeMethodName(method.name).includes(queryKey)
    );
    return matched.length > 0 ? matched : availableMethods;
  }, [availableMethods, queryKey]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="h-4 w-4 text-muted-foreground" /> Доступні методи
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Оберіть методи, доступні для цієї моделі
        </p>
      </div>

      {!draftKindId ? (
        <div className="text-sm text-muted-foreground/60 py-8 border-2 border-dashed rounded-xl text-center bg-muted/10 flex flex-col items-center gap-3">
          <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
          <p>Спочатку оберіть Вид товару</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Знайти або додати метод
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={newMethodName}
                  onChange={(e) => onMethodNameChange(e.target.value)}
                  placeholder="Напр. DTF"
                  className="border-border/60 bg-background/60 pl-9"
                />
              </div>
            </div>

            {exactHere ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-primary" />
                <span>
                  «{exactHere.name}» уже є в цьому виді — позначте його у списку нижче
                </span>
              </div>
            ) : null}

            {suggestions.length > 0 ? (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">
                  {exactInDirectory ? "Такий метод уже є в CRM:" : "Схоже на вже наявні:"}
                </p>
                {suggestions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={methodSaving}
                    onClick={() => onAddMethod(draftKindId, entry.name, entry.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{entry.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {entry.kindCount > 0 ? `у ${entry.kindCount} видах · додати` : "додати"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {canCreate ? (
              <div className="mt-2 space-y-1">
                <Button
                  onClick={() => onAddMethod(draftKindId, query)}
                  disabled={methodSaving}
                  className="w-full gap-2"
                  size="sm"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                  {methodSaving ? "Додавання..." : `Створити «${query}»`}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Новий метод з'явиться в довіднику всієї CRM — спершу перевірте підказки вище.
                </p>
              </div>
            ) : null}

            {methodError && <div className="mt-2 text-xs text-destructive">{methodError}</div>}
          </div>

          {availableMethods.length === 0 ? (
            <div className="text-sm text-muted-foreground/60 py-8 border-2 border-dashed rounded-xl text-center bg-muted/10 flex flex-col items-center gap-3">
              <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
              <p>У виді "{draftKindName}" ще немає методів</p>
            </div>
          ) : null}

          {availableMethods.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {visibleMethods.map((method) => {
                const isSelected = selectedMethodIds.includes(method.id);
                return (
                  <label
                    key={method.id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                      isSelected
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/50 bg-background/50 text-foreground hover:border-border/80 hover:bg-muted/20",
                      exactHere?.id === method.id && !isSelected && "border-primary/40 bg-primary/5"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleMethod(method.id)}
                    />
                    <span className="min-w-0 truncate text-sm font-medium">
                      {method.name}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
