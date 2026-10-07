import * as React from "react";
import { Copy, FileSpreadsheet } from "@/components/icons/appIcons";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { buildImportBatch, type BuiltBatch } from "./importBatch";
import { siteListingKeys } from "./queries";
import type { SiteListingCandidate } from "./siteListingState";

/**
 * «Зібрати файл (N)» над станом «Беремо» і результат: посилання з кнопкою
 * «Скопіювати» та інструкція для Хорошопа (REQ-311#p9, спека §5).
 *
 * Інструкція — ДОСЛІВНО за пробною пачкою: кожен пункт там коштував
 * окремого кола (колонки фото Хорошоп сам не ставить ніколи; «Відсутні
 * товари» з будь-чим, крім «Нічого не робити», зачепить увесь каталог).
 */

export const IMPORT_STEPS = [
  "У Хорошопі: «Товари → Імпорт», вставити посилання.",
  "Над колонками з посиланнями на фото вибрати «Фото» і «Галерея»: Хорошоп сам їх не ставить ніколи. Звірити, що «Название модификации (UA)» стала на своє поле.",
  "«Імпортувати», далі у вікні «Операції з товарами»: «Існуючі товари» — «Не оновлювати» (у першій пробі пункт звався «Пропустити»; за замовчуванням стоїть «Оновити»). «Відсутні товари» — лишити «Нічого не робити»: будь-що інше зачепить увесь каталог. «Фотографии» — байдуже, товари нові.",
  "Після імпорту товари приховані: вичитати й увімкнути «Відображати» всім модифікаціям. Поки вони приховані, у «Виберіть колір» на сторінці видно лише колір самої сторінки — це не поломка.",
] as const;

export function SiteListingBatch({
  slug,
  teamId,
  ready,
}: {
  slug: string;
  teamId: string | null;
  ready: SiteListingCandidate[];
}) {
  const queryClient = useQueryClient();
  const [building, setBuilding] = React.useState(false);
  const [built, setBuilt] = React.useState<BuiltBatch | null>(null);

  const build = async () => {
    if (!teamId || ready.length === 0) return;
    setBuilding(true);
    try {
      setBuilt(await buildImportBatch({ teamId, candidates: ready, now: new Date() }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Файл не зібрався.");
    } finally {
      setBuilding(false);
      void queryClient.invalidateQueries({ queryKey: siteListingKeys.candidates(slug) });
    }
  };

  const copy = async () => {
    if (!built) return;
    try {
      await navigator.clipboard.writeText(built.url);
      toast.success("Посилання скопійовано — діє 7 днів.");
    } catch {
      toast.error("Не вдалося скопіювати — виділіть посилання вручну.");
    }
  };

  return (
    <div className="space-y-2">
      <Button size="sm" variant="primary" disabled={!teamId || ready.length === 0} loading={building} onClick={() => void build()}>
        <FileSpreadsheet aria-hidden="true" />
        Зібрати файл ({ready.length})
      </Button>
      {built ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
          <p className="font-medium text-foreground">
            Файл зібрано: моделей {built.models}, рядків {built.rows}. Вони перейшли в «У файлі».
          </p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              controlSize="sm"
              value={built.url}
              aria-label="Посилання на файл імпорту"
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 text-xs"
            />
            <Button size="xs" variant="outline" onClick={() => void copy()}>
              <Copy aria-hidden="true" />
              Скопіювати
            </Button>
          </div>
          <ol className="list-decimal space-y-1 pl-4 text-foreground">
            {IMPORT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
