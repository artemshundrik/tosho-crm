import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Захист від закриття модалки з незбереженими даними.
 *
 * ЧОМУ НЕ ПОРІВНЯННЯ СТАНІВ. Знімок форми на відкритті й порівняння при
 * закритті вимагали б сигналу від кожної з 33 форм, і кожна мала б сама
 * вирішувати, коли її стан «початковий», — а 14 із них дозаповнюються
 * асинхронно. Тому рахуємо не «стан відрізняється», а «людина щось натиснула».
 *
 * ЩО РАХУЄТЬСЯ ЗМІНОЮ. Спершу тут були лише ARIA-ролі значень
 * (`[role="option"]`, switch, checkbox…). Це виявилось хибним припущенням про
 * цей код: 12 із 33 форм — зокрема `NewQuoteDialog` — будують дропдауни руками,
 * зі звичайних `<button>` усередині `Popover`, без жодної ролі. Клацання по
 * замовнику, статусу чи валюті детектор не бачив узагалі, і модалка закривалась
 * мовчки. Тому ловимо БУДЬ-ЯКУ кнопку, а навігацію виключаємо явно.
 *
 * ЧОМУ ЦЕ НЕ СПРАЦЬОВУЄ ПІСЛЯ ЗБЕРЕЖЕННЯ. Успішне збереження закриває модалку
 * програмно, через `onOpenChange(false)` у самій формі — не через хрестик і не
 * через Esc. Перехоплюємо лише ці два шляхи, тож питання після «Зберегти» не
 * буде за побудовою.
 */

/** Натискання по цьому означає «людина міняє дані». */
const MUTATING = [
  "button",
  "[role='option']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
].join(",");

/**
 * Що не рахуємо, попри те що це кнопки.
 *
 * `[role="tab"]` — навігація між секціями форми, даних не змінює.
 * `[data-unsaved-ignore]` — аварійний вихід; ним ОБОВ'ЯЗКОВО позначені самі
 * кнопки закриття. Слухач висить у фазі захоплення, тобто спрацьовує раніше за
 * React-обробник хрестика; без цього виключення клік по хрестику позначав би
 * форму зміненою за мить до перевірки, і чиста форма питала б завжди.
 */
const IGNORED = "[role='tab'],[data-unsaved-ignore]";

/**
 * Чи означає натискання по цьому елементу зміну даних.
 *
 * Винесено назовні заради тесту: саме тут була помилка, через яку модалка
 * прорахунку закривалась мовчки після клацання по саморобних пікерах.
 *
 * Поля вводу навмисно НЕ в MUTATING: сам клік у поле ще не зміна, а набір
 * тексту однаково дасть подію `input`.
 */
export function isMutatingTarget(target: Element | null): boolean {
  if (!target?.closest) return false;
  if (target.closest(IGNORED)) return false;
  return Boolean(target.closest(MUTATING));
}

type UnsavedGuardOptions = {
  /** Вимикається для інформаційних модалок (`dismissible`). */
  enabled: boolean;
  /**
   * Явний сигнал від форми. Якщо переданий — автовизначення не вмикається.
   * Для випадків, де потрібна точність, а не перестраховка.
   */
  isDirty?: boolean;
};

/**
 * Слухає, чи людина щось міняла у відкритій модалці.
 *
 * Окремий компонент, а не частина хука, свідомо: він має монтуватись і
 * розмонтовуватись РАЗОМ із вмістом модалки. Пояснення — у `useUnsavedGuard`.
 */
export function UnsavedGuardListener({
  enabled,
  touchedRef,
}: {
  enabled: boolean;
  touchedRef: React.MutableRefObject<boolean>;
}) {
  React.useEffect(() => {
    if (!enabled) return;
    // Кожне відкриття починається з чистої форми.
    touchedRef.current = false;

    const markAlways = () => {
      touchedRef.current = true;
    };
    /**
     * Позначку ставимо наступним мікротаском, а не одразу: слухач висить у фазі
     * захоплення, тобто раніше за React-обробник кнопки. Інакше клік по
     * «Скасувати» позначав би форму зміненою за мить до того, як цей самий клік
     * питає `shouldBlock()`. Кнопок «Скасувати» в застосунку 72, і жодна не має
     * `data-unsaved-ignore` — тегувати кожну означало б забути на сімдесят третій.
     */
    const markIfMutating = (event: Event) => {
      if (!isMutatingTarget(event.target as Element | null)) return;
      queueMicrotask(() => {
        touchedRef.current = true;
      });
    };
    // Вибір опції з клавіатури кліку не породжує: Radix віддає фокус самому
    // елементу й слухає keydown. Без цього людина, що ходить Tab'ом, лишалась
    // би без захисту — саме та, кому він потрібніший.
    const markIfMutatingKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      markIfMutating(event);
    };

    // Слухаємо на document, а не на вмісті модалки: списки, комбобокси й пікери
    // Radix малює в порталах поза її DOM, і туди події не спливають. Модалка
    // модальна, тож усе інтерактивне зараз — усе одно її.
    document.addEventListener("input", markAlways, true);
    document.addEventListener("change", markAlways, true);
    document.addEventListener("click", markIfMutating, true);
    document.addEventListener("keydown", markIfMutatingKey, true);
    return () => {
      document.removeEventListener("input", markAlways, true);
      document.removeEventListener("change", markAlways, true);
      document.removeEventListener("click", markIfMutating, true);
      document.removeEventListener("keydown", markIfMutatingKey, true);
    };
  }, [enabled, touchedRef]);

  return null;
}

export function useUnsavedGuard({ enabled, isDirty }: UnsavedGuardOptions) {
  // Саме ref, а не стан: обробник хрестика читає це значення в тому ж такті,
  // що й подія. Стан React оновлюється асинхронно, тож там був би ще старий
  // знімок — і перше ж закриття проходило б повз захист.
  const touchedRef = React.useRef(false);
  const [asking, setAsking] = React.useState(false);
  const auto = isDirty === undefined;

  return {
    /**
     * Прапорець і ref для `<UnsavedGuardListener>`. Його ОБОВ'ЯЗКОВО треба
     * рендерити ВСЕРЕДИНІ вмісту модалки — там, де він з'являється разом із
     * відкриттям і зникає при закритті.
     *
     * ЧОМУ НЕ ПОВЕРТАЄМО ГОТОВИЙ КОМПОНЕНТ. Перша спроба віддавала звідси
     * `Listener: () => <UnsavedGuardListener …/>`, і це мовчки все ламало:
     * стрілка створює НОВИЙ тип компонента на кожному рендері, React вважає
     * його іншим, розмонтовує старий і монтує новий — а монтування скидає
     * позначку. Кожне натискання клавіші перемальовувало форму й стирало
     * пам'ять про попередні, тож заповнений дровер закривався мовчки й губив
     * набране. Спіймано в браузері; юніт-тести цього не бачать.
     *
     * ЧОМУ ЦЕ КРИТИЧНО (справжня причина поломки, знайдена в браузері 2026-08-09).
     * Компонент `DialogContent` виконується ЗАВЖДИ, коли батько його рендерить —
     * Radix ховає лише вміст порталу, а не сам компонент. Поки слухачі
     * реєструвались тут, у хуку, вони висіли на документі й тоді, коли вікно
     * закрите. Через це клік, яким людина ВІДКРИВАЄ вікно, позначав форму
     * зміненою ще до її появи, і порожня форма питала «закрити без збереження?».
     * Скидання ж робилось лише при монтуванні, тож будь-який клік по сторінці
     * перед відкриттям давав те саме.
     *
     * Тепер слухачі живуть у власному компоненті: він монтується разом із
     * відкритим вмістом, скидає позначку на старті й знімає слухачів на виході.
     */
    listening: enabled && auto,
    touchedRef,
    /**
     * Чи перехопити закриття. Саме функція, а не значення: викликається
     * всередині обробника події й має бачити стан на цю мить.
     */
    shouldBlock: () => {
      if (!enabled || asking) return false;
      return auto ? touchedRef.current : Boolean(isDirty);
    },
    asking,
    ask: () => setAsking(true),
    dismiss: () => setAsking(false),
  };
}

export function UnsavedChangesPrompt({
  open,
  onDismiss,
  onDiscard,
}: {
  open: boolean;
  onDismiss: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? null : onDismiss())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Закрити без збереження?</AlertDialogTitle>
          <AlertDialogDescription>
            Введене не збережеться. Можна повернутись і натиснути «Зберегти».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-unsaved-ignore onClick={onDismiss}>
            Продовжити редагування
          </AlertDialogCancel>
          <AlertDialogAction
            data-unsaved-ignore
            onClick={onDiscard}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Закрити без збереження
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
