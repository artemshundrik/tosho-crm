import * as React from "react";
import { Copy, FileSpreadsheet } from "@/components/icons/appIcons";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { buildImportBatch, type BuiltBatch } from "./importBatch";
import { SiteListingHoroshopSteps } from "./SiteListingHoroshopSteps";
import { siteListingKeys } from "./queries";
import type { SiteListingCandidate } from "./siteListingState";

/**
 * «Зібрати файл (N)» над станом «Беремо» і результат: посилання з кнопкою
 * «Скопіювати» та кроки для Хорошопа (REQ-311#p9, спека §5). Кроки —
 * SiteListingHoroshopSteps, ті самі, що у вікні «Як це працює».
 */


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
          <SiteListingHoroshopSteps />
        </div>
      ) : null}
    </div>
  );
}
