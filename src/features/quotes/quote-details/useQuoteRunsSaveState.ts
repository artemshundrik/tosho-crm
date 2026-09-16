import { useCallback, useEffect, useMemo, useState } from "react";

import { changedRunItemIds, type PristineDraftRun } from "./quoteRunAutosave";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Відклик автозбереження тиражів — єдине, що каже людині, чи доїхали її числа
 * до бази (REQ-278).
 *
 * НАВІЩО ЦЕ ВЗАГАЛІ. Тиражі зберігаються самі, мовчки, через 900 мс після
 * останнього натиску. Кнопки немає, тоста про успіх теж немає (і не буде: тост
 * на кожну правку числа — це черга спливних вікон уздовж набору суми). Доти,
 * доки все працювало, мовчання читалось як «збережено». Щойно одна гілка
 * перестала писати — а вона перестала, див. `isPristineAutoDraftRun`, — те саме
 * мовчання почало читатись так само, і проєктний менеджер дізнавався про втрату
 * лише з перезавантаженої сторінки.
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ. `QuoteDetailsPage` під ратчетом розміру, і це не
 * формальність: стан «зберігаю / збережено / заблоковано» з власним таймером
 * — саме той різновид логіки, який у сторінці на сім тисяч рядків нікому вже
 * не видно.
 *
 * ПО ПОЗИЦІЯХ, А НЕ НА ВСЮ КАРТКУ. `persistQuoteRuns` шле всі тиражі одним
 * запитом, тож технічно стан один на прорахунок. Але напис живе в шапці
 * переліку тиражів КОЖНОЇ позиції, і «Збережено» над товаром, якого не
 * чіпали, — неправда про те, на що людина дивиться.
 */

export type QuoteRunSaveStatus = "idle" | "pending" | "saving" | "saved" | "blocked";

/**
 * Стан і ПРИЧИНА разом, одним значенням.
 *
 * Окремим пропом причина розходилась би зі станом: `blocked` без тексту — це
 * знову червона мітка без дії, а текст без `blocked` — підказка нізвідки.
 */
export type QuoteRunSaveState = { status: QuoteRunSaveStatus; reason: string | null };

/** Скільки живе «Збережено». Приблизно як тост: помітити встигаєш, набриднути — ні. */
const RECEIPT_MS = 2600;

export function useQuoteRunsSaveState(params: {
  /** Стан форми. */
  runs: QuoteRun[];
  /** Те, що зараз у базі. */
  savedRuns: QuoteRun[];
  /** Заготовка сторінки: нечіпана, вона не зміна й відклику не заслуговує. */
  pristineDraft: PristineDraftRun | null;
  saving: boolean;
  /**
   * Незаповнені поля прорахунку — той самий гейт, що й у `saveRuns`. Він
   * ГЛОБАЛЬНИЙ: поки в ньому щось є, автозбереження не намагається писати
   * взагалі, і жодна правка тиражів нікуди не їде.
   */
  requirements: readonly string[];
  /** Тиражі, які тримає гейт ПДВ. Теж глобально: запит один на всі тиражі. */
  unsavedRunCount: number;
}) {
  const { runs, savedRuns, pristineDraft, saving, requirements, unsavedRunCount } = params;

  const [justSavedItemIds, setJustSavedItemIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  /** Рядки, на яких база сказала «ні». `null` — відмов не було. */
  const [failedRuns, setFailedRuns] = useState<QuoteRun[] | null>(null);

  const dirtyItemIds = useMemo(
    () => changedRunItemIds(runs, savedRuns, pristineDraft),
    [pristineDraft, runs, savedRuns]
  );

  // «Збережено» гасне саме: це квитанція про мить, а не вічний ярлик «тут усе
  // гаразд». Ярлик перестали б читати за день.
  useEffect(() => {
    if (justSavedItemIds.size === 0) return;
    const timer = window.setTimeout(() => setJustSavedItemIds(new Set<string>()), RECEIPT_MS);
    return () => window.clearTimeout(timer);
  }, [justSavedItemIds]);

  /**
   * Квитанцію виписують ДО перечитування з бази: після нього збережене й
   * поточне збігаються, і сказати, над якими позиціями писати «Збережено»,
   * буде вже нема з чого.
   */
  /**
   * Відмова спиняє автозбереження до наступної правки — інакше воно б'ється в
   * ту саму стіну кожні 900 мс.
   *
   * ЗАМІРЯНО, а не припущено (REQ-278, прогін під наскрізним сторожем):
   * заблокований запис дав СІМ спроб за шість секунд, і кожна — свій тост
   * «Тираж не збережено». Причина в тому, що ефект автозбереження дивиться на
   * розбіжність підпису, а невдалий запис її не знімає: `runsSaving` падає в
   * false, ефект перезапускається, підпис усе той самий.
   *
   * Латка тримається, поки в тиражах нічого не змінилось від миті відмови.
   * Виправив число — спробуємо знову; сидиш і дивишся — сторінка мовчить, а
   * «не збережено» в шапці каже правду замість вічного «Зберігаю…».
   */
  const retryHalted = useMemo(
    () => failedRuns !== null && changedRunItemIds(runs, failedRuns).size === 0,
    [failedRuns, runs]
  );

  const markFailed = useCallback((attemptedRuns: QuoteRun[]) => {
    setFailedRuns(attemptedRuns);
  }, []);

  /**
   * ЧОМУ НЕ ПРОСТО «не збережено» (REQ-281). Червона мітка без причини — це
   * тривога без дії: проєктний менеджер бачив її над тиражами, чіпав числа,
   * перезавантажував сторінку й не розумів, за що зачепитись. Причина при
   * цьому в застосунку БУЛА — банером угорі картки, — але людина працює внизу,
   * у блоці тиражів, і до банера доскролює хіба випадково.
   *
   * Порядок той самий, що в `resolveStatusBlockReason`: спершу те, що взагалі
   * не дає писати, потім те, що тримає конкретні рядки, потім відмова бази.
   */
  const blockedReason = useMemo(() => {
    if (requirements.length > 0) return `заповніть: ${requirements.join(", ")}`;
    if (unsavedRunCount > 0) return "вкажіть, з ПДВ вартість товару чи без";
    return null;
  }, [requirements, unsavedRunCount]);

  const markSaved = useCallback(
    (nextRuns: QuoteRun[], previousRuns: QuoteRun[]) => {
      setJustSavedItemIds(changedRunItemIds(nextRuns, previousRuns, pristineDraft));
      setFailedRuns(null);
    },
    [pristineDraft]
  );

  /**
   * Порядок перевірок = порядок, у якому це важливо людині: спершу «твоїх
   * чисел у базі немає», потім «їдуть», і лише потім «доїхали».
   *
   * `pending` і `saving` навмисно не розрізняються на екрані — пауза в 900 мс
   * це вже «пішло», а показувати внутрішній устрій замість відповіді на
   * питання «моє число в базі?» нема сенсу.
   */
  const stateForItem = useCallback(
    (itemId: string): QuoteRunSaveState => {
      if (dirtyItemIds.has(itemId)) {
        if (blockedReason !== null) return { status: "blocked", reason: blockedReason };
        if (retryHalted) {
          return { status: "blocked", reason: "база відмовила — правка лишилась у браузері" };
        }
        return { status: saving ? "saving" : "pending", reason: null };
      }
      return { status: justSavedItemIds.has(itemId) ? "saved" : "idle", reason: null };
    },
    [blockedReason, dirtyItemIds, justSavedItemIds, retryHalted, saving]
  );

  return { stateForItem, markSaved, markFailed, retryHalted };
}
