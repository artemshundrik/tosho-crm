import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  isMarkupFrozen,
  resolveQuoteMarkupGate,
  resolveQuoteRunMarkupState,
  type QuoteMarkupApproval,
  type QuoteRunMarkupState,
} from "@/lib/quoteMarkupApproval";
import { resolveMarkupBenchmark, type MarkupBenchmark } from "@/lib/quoteMarkupBenchmark";
import { needsMarkupApproval } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";
import { normalizeUnitLabel } from "@/lib/units";
import {
  notifyMarkupApprovalDecided,
  notifyMarkupApprovalRequested,
} from "@/lib/workflowNotifications";

import {
  decideMarkupApproval,
  fetchMarkupBenchmarkSamples,
  fetchQuoteMarkupApprovals,
  requestMarkupApproval,
  withdrawMarkupApproval,
} from "./markupApproval";

/**
 * Уся механіка погодження накрутки нижче дна, знята з картки прорахунку (REQ-149).
 *
 * ЧОМУ ОКРЕМИМ ХУКОМ. QuoteDetailsPage під ратчетом розміру, і це саме той
 * випадок, про який пише шапка scripts/check-file-growth.mjs: нове йде в
 * окремий модуль, а не дописується в кінець сторінки. Тут живуть стан, читання,
 * похідні значення й дві дії — сторінка лишає собі тільки розмітку.
 *
 * ПОБІЧНА ВИГОДА: у файлі немає жодного `try/finally`, тож React Compiler його
 * збирає — на відміну від самої сторінки, де через 28 таких блоків мовчать три
 * правила лінту (REQ-109).
 */

type BenchmarkSubject = {
  id: string;
  unit?: string | null;
  title?: string | null;
  catalogModelId?: string | null;
  catalogKindId?: string | null;
};

type MarkupDialog = { mode: "request" | "reject"; runId: string };

export type UseQuoteMarkupApprovalsParams = {
  quoteId: string;
  teamId: string;
  userId?: string | null;
  /** Позиції прорахунку — по них рахується орієнтир. */
  items: BenchmarkSubject[];
  runs: QuoteRun[];
  getRunPricing: (run: QuoteRun | null) => { costTotal: number; markupRate: number };
  memberById: Map<string, string>;
  /** Зберегти тиражі перед надсиланням запиту (див. submitRequest). */
  saveRuns: () => Promise<void>;
};

export function useQuoteMarkupApprovals({
  quoteId,
  teamId,
  userId,
  items,
  runs,
  getRunPricing,
  memberById,
  saveRuns,
}: UseQuoteMarkupApprovalsParams) {
  // Ключ — id тиражу, значення — НАЙСВІЖІШИЙ запит на нього; чи він ще чинний,
  // вирішує resolveQuoteRunMarkupState.
  const [approvals, setApprovals] = useState<Map<string, QuoteMarkupApproval>>(new Map());
  const [busy, setBusy] = useState(false);
  // Орієнтир рахується по позиції, а не по всьому прорахунку: смуга показує
  // «типово для цієї позиції», і в позицій вони різні.
  const [benchmarks, setBenchmarks] = useState<Map<string, MarkupBenchmark | null>>(new Map());
  // Що вже пішло по мережу — у ref, а НЕ в стані.
  //
  // Спершу це був стан, і воно не працювало: setState всередині ефекту міняв
  // його ж залежність, ефект перезапускався, прибирання першого проходу
  // виставляло `cancelled` — і відповідь, яка вже прийшла, викидалась. Блок
  // назавжди застигав на «рахуємо орієнтир…». Заміряно в прев'ю 30.08.2026.
  const requestedBenchmarksRef = useRef<Set<string>>(new Set());
  // Пояснення пишуть у двох випадках: менеджер, коли просить нижче дна, і
  // погоджувач, коли відхиляє. Підтвердження проходить без вікна — це основна
  // дія, і зайвий крок на ній привчав би клацати «ОК» не читаючи.
  const [dialog, setDialog] = useState<MarkupDialog | null>(null);
  const [dialogNote, setDialogNote] = useState("");

  // saveRuns перестворюється щорендеру; у ref, щоб дії не тягли його в
  // залежності й не перевизначались разом із ним.
  const saveRunsRef = useRef(saveRuns);
  useEffect(() => {
    saveRunsRef.current = saveRuns;
  });

  const reload = useCallback(async () => {
    const result = await fetchQuoteMarkupApprovals(quoteId);
    // Мовчазний провал навмисно: стан погодження — надбудова над карткою, і
    // червона смуга через нього зробила б непрацездатною всю сторінку. Двері
    // при цьому лишаються ЗАКРИТИМИ (порожня мапа = «запиту немає»), тобто
    // помилка читання не відкриває обхідний шлях.
    if (result.ok) setApprovals(result.data);
  }, [quoteId]);

  const reset = useCallback(() => {
    setApprovals(new Map());
    setBenchmarks(new Map());
    // Разом із мапою чистимо й «уже питали»: інша картка — інші позиції.
    requestedBenchmarksRef.current = new Set();
  }, []);

  /**
   * Орієнтир для позицій прорахунку.
   *
   * Рахуємо ОДИН раз на позицію й тримаємо в мапі: смуга перемальовується на
   * кожен рух повзунка, і запит із неї зробив би десятки читань за секунду.
   * Провал читання лишає `null` — блок чесно скаже «замало даних», а не
   * зламається; орієнтир це підказка, а не умова роботи.
   */
  useEffect(() => {
    if (!quoteId || items.length === 0) return;
    const pending = items.filter((item) => !requestedBenchmarksRef.current.has(item.id));
    if (pending.length === 0) return;
    for (const item of pending) requestedBenchmarksRef.current.add(item.id);
    let cancelled = false;
    void Promise.all(
      pending.map(async (item) => {
        const samples = await fetchMarkupBenchmarkSamples({
          quoteId,
          catalogModelId: item.catalogModelId ?? null,
          catalogKindId: item.catalogKindId ?? null,
        });
        return [item.id, samples.ok ? resolveMarkupBenchmark(samples.data) : null] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setBenchmarks((prev) => {
        const next = new Map(prev);
        for (const [itemId, benchmark] of entries) next.set(itemId, benchmark);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items, quoteId]);

  const getRunState = useCallback(
    (run: QuoteRun | null): QuoteRunMarkupState => {
      const pricing = getRunPricing(run);
      return resolveQuoteRunMarkupState({
        costTotal: pricing.costTotal,
        markupRate: pricing.markupRate,
        approval: run?.id ? approvals.get(run.id) ?? null : null,
      });
    },
    [approvals, getRunPricing]
  );

  /**
   * Двері назовні: КП клієнту й перехід у «Затверджено».
   *
   * Рахуємо по ВСІХ тиражах прорахунку, а не лише по позначеному клієнтом: у
   * КП їдуть усі, і «позначу інший тираж» не має бути обхідним шляхом.
   */
  const gate = useMemo(
    () =>
      resolveQuoteMarkupGate(
        runs
          .filter((run): run is QuoteRun & { id: string } => !!run.id)
          .map((run) => {
            const pricing = getRunPricing(run);
            return {
              id: run.id,
              costTotal: pricing.costTotal,
              markupRate: pricing.markupRate,
              approval: approvals.get(run.id) ?? null,
            };
          })
      ),
    [approvals, getRunPricing, runs]
  );

  const runLabel = useCallback(
    (run: QuoteRun) => {
      const item = items.find((candidate) => candidate.id === run.quote_item_id);
      const qty = Math.max(0, Number(run.quantity) || 0);
      const unit = normalizeUnitLabel(item?.unit ?? "шт");
      return item?.title ? `${item.title} · ${qty} ${unit}` : `${qty} ${unit}`;
    },
    [items]
  );

  const viewerName = userId ? memberById.get(userId) ?? null : null;

  const submitRequest = async (runId: string, note: string) => {
    const run = runs.find((candidate) => candidate.id === runId);
    if (!run?.id) return;
    setBusy(true);
    // Спершу ЗБЕРЕГТИ, потім просити. Запит прив'язується до конкретного числа,
    // і якщо воно ще лежить лише в полі, погоджувач побачить старе — рівно та
    // розбіжність, від якої вся ця перевірка й заводиться.
    await saveRunsRef.current();
    const pricing = getRunPricing(run);
    const created = await requestMarkupApproval({
      teamId,
      quoteId,
      runId: run.id,
      markupRate: pricing.markupRate,
      costTotal: pricing.costTotal,
      note,
      userId,
    });
    if (!created.ok) {
      toast.error(created.message);
      setBusy(false);
      return;
    }
    await reload();
    const notified = await notifyMarkupApprovalRequested({
      quoteId,
      requesterName: viewerName,
      runs: [{ label: runLabel(run), markupRate: pricing.markupRate }],
      actorUserId: userId ?? null,
    }).then(
      () => true,
      (error: unknown) => {
        // Сповіщення не має ламати сам запит: він уже в базі й видимий у картці.
        console.warn("Failed to notify markup approvers", error);
        return false;
      }
    );
    toast.success(
      notified
        ? "Запит надіслано — чекаємо на СЕО або головного бухгалтера"
        : "Запит створено, але сповіщення не пішло"
    );
    setBusy(false);
  };

  const submitDecision = async (runId: string, decision: "approved" | "rejected", note: string) => {
    const run = runs.find((candidate) => candidate.id === runId);
    if (!run) return;
    const state = getRunState(run);
    if (state.kind !== "pending") return;
    const approval = state.approval;
    setBusy(true);
    const decided = await decideMarkupApproval({ approvalId: approval.id, decision, note });
    if (!decided.ok) {
      toast.error(decided.message);
      setBusy(false);
      return;
    }
    if (!decided.data) {
      // Рядок уже не «на погодженні»: другий погоджувач устиг раніше. Це не
      // помилка, а звичайна гонка — просто показуємо свіжий стан.
      await reload();
      toast.message("Рішення вже ухвалив хтось інший");
      setBusy(false);
      return;
    }
    await reload();
    await notifyMarkupApprovalDecided({
      quoteId,
      decision,
      markupRate: approval.markupRate,
      runLabel: runLabel(run),
      requesterUserId: approval.requestedBy,
      deciderName: viewerName,
      note,
      actorUserId: userId ?? null,
    }).catch((error: unknown) => {
      console.warn("Failed to notify markup requester", error);
    });
    toast.success(decision === "approved" ? "Накрутку погоджено" : "Накрутку відхилено");
    setBusy(false);
  };

  /**
   * Менеджер підняв накрутку на дно або вище — запит став безпредметним.
   * Без цього він висів би в черзі погоджувача назавжди, і той ухвалював би
   * рішення про число, якого вже немає.
   *
   * Кличеться з saveRuns ПІСЛЯ запису: приймає вже збережені рядки, а не стан
   * форми, інакше запит гасився б під число, яке ще не поїхало в базу.
   */
  const withdrawSettledRequests = useCallback(
    async (savedRuns: Array<{ id?: string | null; markup_rate?: number | null; costTotal: number }>) => {
      const stale = savedRuns.filter((run) => {
        if (!run.id) return false;
        const approval = approvals.get(run.id);
        if (!approval || approval.status !== "pending") return false;
        return !needsMarkupApproval({ costTotal: run.costTotal, markupRate: Number(run.markup_rate) || 0 });
      });
      if (stale.length === 0) return;
      await Promise.all(
        stale.map((run) => withdrawMarkupApproval(approvals.get(run.id as string)!.id))
      );
      await reload();
    },
    [approvals, reload]
  );

  const openDialog = (mode: MarkupDialog["mode"], runId: string) => {
    setDialogNote("");
    setDialog({ mode, runId });
  };

  return {
    approvals,
    benchmarks,
    busy,
    dialog,
    dialogNote,
    gate,
    getRunState,
    isFrozen: isMarkupFrozen,
    openDialog,
    reload,
    reset,
    setDialog,
    setDialogNote,
    submitDecision,
    submitRequest,
    withdrawSettledRequests,
  };
}
