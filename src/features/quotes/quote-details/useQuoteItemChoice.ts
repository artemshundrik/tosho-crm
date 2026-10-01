import { useCallback, useMemo, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import { isQuoteItemPreselected } from "@/lib/quoteItemApproval";
import { needsApprovedRunChoice, pickApprovedRun } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

import { getErrorMessage } from "./config";
import { logQuoteActivity } from "./queries";
import type { QuoteItemChoiceRow } from "./QuoteItemChoiceDialog";

/**
 * «Що погодив клієнт» — стан, запис і подія стрічки в одному вузлі (REQ-267#p1).
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ, А НЕ В СТОРІНЦІ. `QuoteDetailsPage` під ратчетом
 * розміру, і це рівно той випадок, який ратчет описує в своїй шапці: нова
 * справа зі своїм станом, своїм записом у базу й своїм рядком у стрічку. У
 * сторінці від неї лишається виклик хука, шість рядків перехоплення в
 * `handleQuickStatusChange` і десять рядків розмітки вікна.
 */

export type QuoteItemChoiceInput = {
  id: string;
  position?: number;
  title: string;
  unit: string;
  is_approved?: boolean | null;
};


/**
 * Записати вибір клієнта по позиціях прорахунку.
 *
 * ДВА ЗАПИТИ НА ДВА СТАНИ, а не по рядку на позицію. Вибір приходить із вікна
 * цілим («оці взяли, оці ні»), і дробити його на N запитів означало б
 * допустити мить, у якій половина позицій уже погоджена, а половина ще ні —
 * саме тоді, коли сторінка перечитує підсумок.
 *
 * `approved_at`/`approved_by` пишуться разом із прапорцем: без них на картці
 * нема чого показати, а питання «хто це вирішив» виникає рівно тоді, коли з
 * рішенням не згодні.
 */
export async function saveQuoteItemChoice(params: {
  quoteId: string;
  approvedItemIds: string[];
  declinedItemIds: string[];
  userId: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const stampedAt = new Date().toISOString();
    const stampedBy = params.userId ?? null;
    const write = async (itemIds: string[], isApproved: boolean) => {
      if (itemIds.length === 0) return;
      const { error } = await supabase
        .schema("tosho")
        .from("quote_items")
        .update({
          is_approved: isApproved,
          approved_at: stampedAt,
          approved_by: stampedBy,
        } as never)
        .eq("quote_id", params.quoteId)
        .in("id", itemIds);
      if (error) throw error;
    };
    await write(params.approvedItemIds, true);
    await write(params.declinedItemIds, false);
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося зберегти вибір клієнта") };
  }
}

/**
 * Мітка події — СПРАВЖНІЙ момент, не настінний час (docs/DATETIME.md §2).
 * `approved_at` пишеться через `toISOString()`, тож читається симетрично
 * локальними полями. `parseDeadlineDate` тут був би помилкою: він тлумачить
 * число як настінне й зсунув би позначку на пояс.
 */
export function formatQuoteItemChoiceStamp(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })} ${date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`;
}

export function useQuoteItemChoice(params: {
  quoteId: string;
  teamId: string;
  userId: string | null | undefined;
  items: QuoteItemChoiceInput[];
  /**
   * УСІ тиражі прорахунку, а не «вибраний». Раніше сторінка віддавала один
   * тираж — той, що відкритий вкладкою, — і вікно «Що погодив клієнт»
   * показувало «кепка 100 шт · 45 921 грн» лише тому, що менеджер дивилась на
   * сотню, тоді як замовлення бере ПОГОДЖЕНИЙ тираж (REQ-317, TS-0926-0053).
   * Тепер, який тираж у рядку, вирішує те саме правило, що й замовлення:
   * `pickApprovedRun`.
   */
  runs: QuoteRun[];
  /** Сума тиражу — рахує сторінка (ставки компанії, ПДВ), хук лише питає. */
  getRunPricing: (run: QuoteRun) => { saleTotal: number };
  /**
   * Позначити тираж «Погодив клієнт» просто з вікна — ТИМ САМИМ шляхом, що й
   * кнопка на картці (стан тиражів + автозбереження). Окремого запису тут нема
   * навмисно: друга дорога до тієї ж колонки розійшлася б із першою на
   * частковому унікальному індексі (див. `upsertQuoteRuns`).
   */
  onPickRun: (itemId: string, runId: string) => void;
  /** Перечитати позиції, щоб картка показала приглушені. */
  onSaved: () => Promise<void>;
  /** Довести до кінця те, заради чого вікно й відкривали: сам запис статусу. */
  onApprove: (note: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const { quoteId, teamId, userId, items, runs, getRunPricing, onPickRun, onSaved, onApprove, onError } =
    params;

  // Тираж без id ще не доїхав до бази: позначити його нема чим, і замовлення
  // його не побачить. Позиція тут завжди своя — вікно питають лише тоді, коли
  // позицій кілька, тож запасне «тираж без позиції = єдиної» не потрібне.
  const runsFor = useCallback(
    (item: { id: string }) =>
      runs.flatMap((run) =>
        run.id && run.quote_item_id === item.id
          ? [
              {
                id: run.id,
                qty: Number(run.quantity) || 0,
                lineTotal: getRunPricing(run).saleTotal,
                is_approved: run.is_approved,
              },
            ]
          : []
      ),
    [getRunPricing, runs]
  );

  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /**
   * Нотатка живе окремо: у швидкій дії вона приходить аргументом, а після вікна
   * виклик робиться заново — без цього поля нотатка з вікна статусів губилась би.
   */
  const [note, setNote] = useState("");

  const dialogItems = useMemo<QuoteItemChoiceRow[]>(
    () =>
      items.map((item, index) => {
        const itemRuns = runsFor(item);
        const approved = pickApprovedRun(itemRuns);
        return {
          id: item.id,
          // Номер попереду назви — бо назви повторюються (REQ-267#p1): у
          // прорахунку на три варіанти одного блокнота всі три рядки читались
          // однаково, і відрізнити їх можна було лише за ціною. Номер той
          // самий, що в списку товарів на картці.
          title: `${item.position ?? index + 1}. ${item.title}`,
          unit: item.unit,
          run: approved ? { id: approved.id, qty: approved.qty, lineTotal: approved.lineTotal } : null,
          // Варіанти — лише коли є з чого вибирати. За кількістю, а не за
          // порядком створення: це шкала «100 · 500 · 1000», і в порядку
          // додавання (500 · 100 · 1000) її читали б навпомацки.
          runOptions:
            itemRuns.length > 1
              ? [...itemRuns]
                  .sort((a, b) => a.qty - b.qty)
                  .map((run) => ({ id: run.id, qty: run.qty, lineTotal: run.lineTotal }))
              : [],
          needsRunChoice: needsApprovedRunChoice(itemRuns),
        };
      }),
    [items, runsFor]
  );

  /**
   * Відкрити вікно, підставивши те, що вже погоджено на картці (REQ-317):
   * галочка лише там, де тираж відомий. Див. `isQuoteItemPreselected`.
   */
  const request = useCallback(
    (pendingNote: string) => {
      setSelectedIds(
        items
          .filter((item) => isQuoteItemPreselected(item, needsApprovedRunChoice(runsFor(item))))
          .map((item) => item.id)
      );
      setNote(pendingNote.trim());
      setOpen(true);
    },
    [items, runsFor]
  );

  /**
   * Обрати тираж у вікні — це водночас і «позицію взяли»: клієнт не погоджує
   * тираж товару, від якого відмовився. Тому галочка ставиться сама.
   *
   * Повторний клік по вже погодженому тиражу НІЧОГО не робить: на картці та
   * сама дія знімає позначку, але тут перемикач — це вибір одного з кількох, і
   * «зняти» в ньому означало б залишити позицію без тиражу посеред вікна, яке
   * питає саме про тираж.
   *
   * Права (`canEditRuns`) стереже вікно — вимкненим перемикачем, як і кнопку на
   * картці: на сторінці вони оголошені нижче за цей хук.
   */
  const pickRun = useCallback(
    (itemId: string, runId: string) => {
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) return;
      const target = runsFor(item).find((run) => run.id === runId);
      if (!target) return;
      if (target.is_approved !== true) onPickRun(itemId, runId);
      setSelectedIds((prev) => Array.from(new Set([...prev, itemId])));
    },
    [items, onPickRun, runsFor]
  );

  const toggle = useCallback(
    (itemId: string, checked: boolean) => {
      // Позицію без погодженого тиражу галочкою не беруть: у замовлення їй нема
      // з чим їхати, і рядок показав би суму, якої клієнт не бачив. Тираж
      // обирають перемикачем — він галочку й ставить (`pickRun`).
      if (checked && dialogItems.some((row) => row.id === itemId && row.needsRunChoice)) return;
      setSelectedIds((prev) =>
        checked ? Array.from(new Set([...prev, itemId])) : prev.filter((id) => id !== itemId)
      );
    },
    [dialogItems]
  );

  const cancel = useCallback(() => {
    setOpen(false);
    setSelectedIds([]);
    setNote("");
  }, []);

  /**
   * Зберегти вибір і ЛИШЕ ПОТІМ перевести статус.
   *
   * Порядок не косметика: «Затверджено» вмикає підсумок за погодженими
   * позиціями, і якби статус приїхав першим, між двома записами існувала б
   * мить, коли прорахунок затверджений, а відповіді про позиції ще немає —
   * рівно той стан, від якого все це й робиться. Не зберіглось — статус не
   * рухаємо взагалі.
   */
  const confirm = useCallback(async () => {
    setBusy(true);
    const selected = new Set(selectedIds);
    const approvedItemIds = items.filter((item) => selected.has(item.id)).map((item) => item.id);
    const declinedItems = items.filter((item) => !selected.has(item.id));
    const saved = await saveQuoteItemChoice({
      quoteId,
      approvedItemIds,
      declinedItemIds: declinedItems.map((item) => item.id),
      userId,
    });
    if (!saved.ok) {
      setBusy(false);
      onError(saved.message);
      return;
    }
    // У стрічку пишемо лише ВІДМОВУ: «взяли все» — типовий перебіг, і рядок про
    // нього був би шумом у стрічці кожного затвердження.
    if (declinedItems.length > 0) {
      await logQuoteActivity(
        {
          teamId,
          action: "зафіксував вибір клієнта",
          entityType: "quotes",
          entityId: quoteId,
          title: `Клієнт не взяв: ${declinedItems.map((item) => item.title).join(", ")}`,
          href: `/orders/estimates/${quoteId}`,
          metadata: {
            source: "quote_item_choice",
            approved: approvedItemIds.length,
            declined: declinedItems.length,
          },
        },
        "Помилка запису вибору"
      );
    }
    setBusy(false);
    setOpen(false);
    await onSaved();
    await onApprove(note);
  }, [items, note, onApprove, onError, onSaved, quoteId, selectedIds, teamId, userId]);

  return { open, selectedIds, busy, dialogItems, request, toggle, pickRun, cancel, confirm };
}
