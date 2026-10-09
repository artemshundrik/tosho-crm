import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { useNow } from "@/hooks/useNow";

import { SiteListingBatch } from "./SiteListingBatch";
import { SiteListingRecipients } from "./SiteListingRecipients";
import { SiteListingRow, type SiteListingRowActions } from "./SiteListingRow";
import {
  useSiteListingCandidates,
  useSiteListingDecide,
  useSiteListingPatch,
  useSiteListingRetryDraft,
} from "./queries";
import {
  candidateTab,
  countByTab,
  readyForFile,
  SITE_LISTING_TABS,
  type SiteListingCandidate,
  type SiteListingTab,
} from "./siteListingState";

/**
 * Блок «На сайт» на сторінці постачальника (REQ-311#p4, спека §5): моделі
 * постачальника, яких ще немає на avanprint.ua. Рішення в CRM одне —
 * «беремо / не беремо»; узяте йде у файл імпорту прихованим, вичитка й показ
 * на сайті — у Хорошопі.
 *
 * Показують його ті самі, хто бачить «Інтеграції» (власник, СЕО, IT):
 * перевірку робить сторінка, база тримає той самий рубіж RLS.
 */

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Не вдалося зберегти.");

export function SiteListingQueue({
  slug,
  supplierName,
  teamId,
  className,
}: {
  slug: string;
  supplierName: string;
  teamId: string | null;
  className?: string;
}) {
  const now = useNow();
  const [tab, setTab] = React.useState<SiteListingTab>("new");
  const candidates = useSiteListingCandidates(slug, true);
  const decide = useSiteListingDecide(slug, teamId);
  const retry = useSiteListingRetryDraft(slug);
  const patch = useSiteListingPatch(slug);
  const [busyItem, setBusyItem] = React.useState<string | null>(null);

  const all = React.useMemo(() => candidates.data ?? [], [candidates.data]);
  const counts = countByTab(all);
  const visible = all.filter((candidate) => candidateTab(candidate) === tab);
  const ready = all.filter((candidate) => readyForFile(candidate, now));

  const run = (key: string, promise: Promise<unknown>) => {
    setBusyItem(key);
    promise.catch((error) => toast.error(errorText(error))).finally(() => setBusyItem(null));
  };

  const actions: SiteListingRowActions = {
    busyItem,
    decide: (candidate: SiteListingCandidate, decision) =>
      run(candidate.item_id ?? candidate.model_name, decide.mutateAsync({ candidate, decision })),
    retryDraft: (itemId) => run(itemId, retry.mutateAsync(itemId)),
    setCategory: (itemId, category) => run(itemId, patch.mutateAsync({ itemId, patch: { category_override: category } })),
    returnToTake: (itemId) => run(itemId, patch.mutateAsync({ itemId, patch: { batch_id: null } })),
  };

  return (
    <section className={className}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">На сайт</h2>
        <SiteListingRecipients teamId={teamId} />
      </div>
      <p className="mt-0.5 text-2xs text-muted-foreground">
        Моделі {supplierName}, яких ще немає на avanprint.ua. «Беремо» готує чернетку картки, зібраний файл
        імпортують у Хорошопі прихованим.
      </p>

      <div className="mt-3 rounded-section border border-border/60 bg-card">
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedGroup>
            {SITE_LISTING_TABS.map((item) => (
              <Button
                key={item.key}
                variant="segmented"
                size="xs"
                aria-pressed={tab === item.key}
                onClick={() => setTab(item.key)}
              >
                {item.label}
                <span className="tabular-nums text-muted-foreground">{counts[item.key]}</span>
              </Button>
            ))}
          </SegmentedGroup>
        </div>

        {tab === "take" ? (
          <div className="px-3 pb-2">
            <SiteListingBatch slug={slug} teamId={teamId} ready={ready} />
          </div>
        ) : null}

        <div className="px-2 pb-2">
          {candidates.isError ? (
            <div className="px-3 py-6 text-center text-sm">
              <p className="text-destructive">Не вдалося прочитати чергу.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void candidates.refetch()}>
                Спробувати ще
              </Button>
            </div>
          ) : null}
          {candidates.isPending ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Рахую, чого немає на сайті…</p>
          ) : null}
          {!candidates.isPending && !candidates.isError && visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Тут порожньо.</p>
          ) : null}
          {visible.map((candidate) => (
            <SiteListingRow
              key={candidate.item_id ?? candidate.model_name}
              candidate={candidate}
              now={now}
              actions={actions}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
