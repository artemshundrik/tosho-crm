import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { KanbanVirtualList } from "./KanbanVirtualList";
import { cn } from "@/lib/utils";

/**
 * СПИСОК КАРТОК КОЛОНКИ — ОДИН НА ВСІ ДОШКИ, РАЗОМ ІЗ РУХОМ.
 *
 * НАВІЩО. До 26.08.2026 кожна дошка сама вирішувала, що показати під час
 * перетягування, і виходили три різні відповіді: прорахунки малювали смугу
 * вставки з номером позиції, дизайн і беклог — нічого. Спільного не було навіть
 * у тому, ЩО повідомляють користувачу.
 *
 * СМУГА ВСТАВКИ ПРИБРАНА НЕ ЧЕРЕЗ КРАСУ, А ЧЕРЕЗ БРЕХНЮ. На прорахунках вона
 * рахувала індекс під курсором (`dragPlaceholder.index`) і показувала, між яких
 * саме карток ляже ця. Але при відпусканні викликається `handleDropToStatus`,
 * яка приймає ОДИН аргумент — статус. Порядок карток у колонці не зберігався
 * ніде: ні поля під нього в базі, ні запиту. Тобто смуга обіцяла місце, якого
 * після відпускання не буде, і картка їхала туди, куди її клало сортування
 * дошки. Показувати точність, якої немає, гірше, ніж не показувати нічого.
 *
 * ЩО ЗАМІСТЬ. Правду: картку приймає КОЛОНКА (її і підсвічуємо), а куди саме
 * картка сяде — показує сам рух після відпускання. Тому цей компонент і
 * з'явився: замість обіцянки наперед — чесний рух за фактом.
 *
 * ТРИ РУХИ, І ВСІ ТРИ — ПРО ОДНЕ: НЕ ГУБИТИ КАРТКУ З ОЧЕЙ.
 *   приїзд   картка з'являється в новій колонці, а не блимає на місці
 *   переїзд  сусіди СПОВЗАЮТЬ на нове місце (FLIP), а не перестрибують
 *   від'їзд  картка згортається, і колонка стуляється за нею
 *
 * ЧОМУ FLIP, А НЕ CSS-ПЕРЕХОДИ. Картки лежать звичайним потоком, і після зміни
 * даних браузер СТРИБКОМ переставляє їх у нові координати — анімувати тут нема
 * чого, зміни стилю не було. FLIP міряє позиції до й після, зсуває картку
 * трансформом назад у стару позицію і відпускає в нуль: рух малює вже
 * композитор, макет при цьому не чіпається.
 *
 * ЧОМУ РУХ ЗАПУСКАЄТЬСЯ ЛИШЕ НА ЗМІНУ ДАНИХ. На дошці дизайну список
 * віртуалізований: під час прокрутки набір намальованих карток міняється
 * щокадру, і наївний FLIP приймав би прокрутку за переїзд — картки літали б по
 * екрану від самого руху колеса. Тому сторожем стоїть перелік КЛЮЧІВ: не
 * змінився — позиції просто перезаписуються без жодної анімації.
 */

/** Тривалості. Приїзд помітніший за від'їзд: поява — новина, зникнення — ні. */
const ENTER_MS = 260;
const MOVE_MS = 320;
const EXIT_MS = 200;

/** Різкий старт, довгий вибіг — рух читається як «доїхало», а не «проїхало». */
const EASE_MOVE = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_EXIT = "cubic-bezier(0.4, 0, 1, 1)";

/**
 * Зсув, більший за цей, вважаємо не переїздом, а перебудовою списку (зміна
 * фільтра, стрибок прокрутки). Тягти картку через пів екрана — не інформація,
 * а миготіння.
 */
const MAX_MOVE_PX = 640;

/**
 * Скільки карток може змінитись, щоб це ще вважалось ЗМІНОЮ, а не перебудовою
 * списку.
 *
 * Замір у браузері 26.08.2026: пошук по дошці прорахунків залишив 57 карток зі
 * 101, і всі 44, що пішли, почали одночасно анімувати `height` — властивість
 * макета, тобто повний перерахунок на кожен кадр сорок чотири рази поспіль.
 * Виглядало б це теж погано: сорок чотири картки, які повільно згортаються, —
 * не інформація, а гальма.
 *
 * Справжні дії, заради яких рух і робився, чіпають одну картку: перетягнули,
 * видалили, змінили статус. Усе, що більше, — це фільтр, пошук або
 * перезавантаження даних, і там правильна поведінка саме миттєва.
 */
const BULK_CHANGE_LIMIT = 4;

/**
 * Вікно, у якому список НЕ анімує зміну даних, бо її вже показав хтось інший.
 *
 * Єдиний споживач — перетягування (kanbanDrag.tsx): воно саме довозить картку
 * до місця й садить пружиною, і якщо після цього список ще раз програє від'їзд
 * зі старої колонки та приїзд у нову, виходить подвійне перетворення на тому
 * самому русі.
 *
 * Вікном, а не одноразовим прапорцем: одна зміна даних чіпає ДВА списки —
 * колонку, з якої картка пішла, і ту, у яку прийшла, — і кожен має свій прохід
 * хореографії. Одноразовий прапорець згасив би лише перший із них.
 */
const SKIP_WINDOW_MS = 300;

/**
 * Прапорець, а не позначка часу — і це не дрібниця.
 *
 * Спершу тут лежав `performance.now() + вікно`, а рендер порівнював його з
 * поточним часом. Читати годинник під час рендеру — нечисто за визначенням
 * (той самий рендер двічі дає різний результат), і сторож компілятора це
 * справедливо ловить. Прапорець із таймером відповідає на те саме питання, не
 * питаючи котра година.
 */
let skipChoreography = false;
let skipTimer: ReturnType<typeof setTimeout> | null = null;

/** Наступну зміну даних не анімувати: рух уже показано (див. SKIP_WINDOW_MS). */
export function skipNextKanbanChoreography() {
  skipChoreography = true;
  if (skipTimer) clearTimeout(skipTimer);
  skipTimer = setTimeout(() => {
    skipChoreography = false;
    skipTimer = null;
  }, SKIP_WINDOW_MS);
}

type LeavingEntry<T> = {
  key: string;
  item: T;
  /** Куди повернути картку на час прощання — індекс, на якому вона стояла. */
  index: number;
};

type Snapshot<T> = { items: T[]; keys: string[] };

type KanbanCardListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Відступ між картками (px). Спільний для потоку й віртуального списку. */
  gap?: number;
  /**
   * Віртуалізувати список. Потрібно там, де карток сотні (дошка дизайну);
   * решті дошок зайве — див. коментар у KanbanVirtualList.
   */
  virtualize?: boolean;
  estimateSize?: number;
  className?: string;
  /**
   * Що показати в порожній колонці.
   *
   * ЧОМУ ЦЕ ТУТ, А НЕ НА СТОРІНЦІ. Спершу порожній стан лишався на дошках, і
   * вони писали `items.length === 0 ? <Порожньо/> : <KanbanCardList/>`. Замір у
   * браузері показав, чим це погано: коли з колонки йде ОСТАННЯ картка, список
   * зникає з дерева цілком — прощатись нема кому, картка просто блимає. І
   * навпаки: перша картка в колонці монтує список заново, а перший рендер
   * навмисно не анімує. Тобто рівно на межі «порожньо / не порожньо» рух
   * пропадав. Тепер список живе завжди, а порожній стан показує сам — і лише
   * після того, як остання картка договорить своє прощання.
   */
  emptyState?: ReactNode;
};

/**
 * Локальна копія перевірки — навмисно. Єдина інша така перевірка живе в
 * `lib/theme.ts` і закрита в модулі теми; тягти сюди залежність від теми заради
 * шести рядків дорожче, ніж повторити їх.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function sameKeys(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function KanbanCardList<T>({
  items,
  getKey,
  renderItem,
  gap = 8,
  virtualize = false,
  estimateSize,
  className,
  emptyState,
}: KanbanCardListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveKeys = items.map(getKey);

  /**
   * Картки, які вже пішли з даних, але ще прощаються. Тримаємо їх У ТОМУ Ж
   * списку, а не окремим шаром: тоді від'їзд працює однаково і в потоці, і у
   * віртуальному списку, і сусіди стуляються самі — бо картка справді займає
   * місце, яке на очах меншає.
   */
  const [leaving, setLeaving] = useState<Array<LeavingEntry<T>>>([]);
  const [snapshot, setSnapshot] = useState<Snapshot<T>>(() => ({ items, keys: liveKeys }));

  /**
   * Порівняння й правка стану ПІД ЧАС РЕНДЕРУ — це документований React-патерн
   * («adjusting state when props change»), а не хитрість. Тут він обов'язковий:
   * привид має з'явитись у ТОМУ Ж кадрі, у якому картка зникла з даних. Якби ми
   * ловили зникнення ефектом, між кадрами був би один кадр без картки — вона
   * блимнула б і лише потім почала прощатись.
   *
   * Через рефи це не робиться: у StrictMode рендер викликається двічі, другий
   * прохід побачив би вже оновлений реф і не знайшов би зниклих узагалі — тобто
   * в розробці анімація тихо не працювала б.
   */
  if (!sameKeys(snapshot.keys, liveKeys)) {
    const liveSet = new Set(liveKeys);
    const gone: Array<LeavingEntry<T>> = [];
    snapshot.keys.forEach((key, index) => {
      if (liveSet.has(key)) return;
      const item = snapshot.items[index];
      if (item !== undefined) gone.push({ key, item, index });
    });

    // Привида не заводимо ні на перебудові списку, ні тоді, коли рух уже
    // показав хтось інший: інакше після перетягування картка ще двісті
    // мілісекунд висіла б у старій колонці, згортаючись удруге.
    const bulk = gone.length > BULK_CHANGE_LIMIT || skipChoreography;
    setSnapshot({ items, keys: liveKeys });
    setLeaving((current) => {
      // Картка, що повернулась у дані (скасування, відкат), більше не прощається.
      const kept = current.filter((entry) => !liveSet.has(entry.key));
      const known = new Set(kept.map((entry) => entry.key));
      const added = bulk || prefersReducedMotion() ? [] : gone.filter((entry) => !known.has(entry.key));
      if (added.length === 0 && kept.length === current.length) return current;
      return [...kept, ...added];
    });
  }

  // Прощання скінчилось — прибираємо привидів. Один таймер на всю пачку:
  // друга картка, що пішла слідом, просто перезапустить його, а перша до того
  // моменту вже догоріла до нульової висоти (fill: forwards) і не видима.
  useEffect(() => {
    if (leaving.length === 0) return;
    const timer = setTimeout(() => setLeaving([]), EXIT_MS + 40);
    return () => clearTimeout(timer);
  }, [leaving]);

  // Картка, що прощається, повертається на свій індекс — щоб колонка стулялась
  // саме там, звідки картку забрали, а не в кінці списку.
  const rendered: Array<{ item: T; key: string; leaving: boolean }> = items.map((item) => ({
    item,
    key: getKey(item),
    leaving: false,
  }));
  leaving.forEach((entry) => {
    rendered.splice(Math.min(entry.index, rendered.length), 0, {
      item: entry.item,
      key: entry.key,
      leaving: true,
    });
  });

  const signature = rendered.map((entry) => `${entry.key}${entry.leaving ? "*" : ""}`).join("|");
  useCardChoreography(containerRef, signature);

  const renderRow = useCallback(
    (entry: { item: T; key: string; leaving: boolean }, index: number, withKey: boolean) => (
      <div
        key={withKey ? entry.key : undefined}
        data-kanban-row={entry.key}
        // Картка, що прощається, більше не приймає ні кліків, ні перетягування:
        // її вже немає в даних, і будь-яка дія по ній стосувалась би привида.
        data-leaving={entry.leaving ? "true" : undefined}
        className={entry.leaving ? "pointer-events-none overflow-hidden" : undefined}
      >
        {renderItem(entry.item, index)}
      </div>
    ),
    [renderItem]
  );

  if (rendered.length === 0) {
    // Контейнер лишається змонтованим і порожнім: наступна картка прийде в уже
    // наявний список, а не змонтує його заново (і не втратить свій приїзд).
    return (
      <div ref={containerRef} className={className}>
        {emptyState}
      </div>
    );
  }

  if (virtualize) {
    return (
      <div ref={containerRef} className={className}>
        <KanbanVirtualList
          items={rendered}
          getKey={(entry) => entry.key}
          renderItem={(entry, index) => renderRow(entry, index, false)}
          gap={gap}
          estimateSize={estimateSize}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("flex w-full flex-col", className)} style={{ gap: `${gap}px` }}>
      {rendered.map((entry, index) => renderRow(entry, index, true))}
    </div>
  );
}

/**
 * FLIP для карток колонки.
 *
 * Працює на ряди з `data-kanban-row`, а не на самі картки: рядок — це те, що
 * реально займає місце в потоці, і саме його висоту треба згортати, коли картка
 * прощається.
 */
function useCardChoreography(containerRef: RefObject<HTMLDivElement | null>, signature: string) {
  const rects = useRef(new Map<string, DOMRect>());
  const lastSignature = useRef<string | null>(null);
  /**
   * Чи був у попередньому кадрі привид, що прощався.
   *
   * ЗАМІРЯНО 28.08.2026, коли Артем поскаржився на «подвійне мигання» при
   * перенесенні картки. Інструментував Element.animate і побачив таке: спершу
   * картка згортається (200 мс), а через 339 мс п'ять сусідів окремо їдуть на
   * 131 px. Тобто рух показувався ДВІЧІ — один раз висотою привида, другий раз
   * переїздом сусідів уже після його зникнення.
   *
   * Причина: позиції для FLIP записуються в кадрі, де привид ще на повну
   * висоту. Коли він зникає, різниця позицій дорівнює саме тій висоті — і
   * сусіди «переїжджають» туди, де вже стоять.
   */
  const hadGhost = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-kanban-row]"));
    const next = new Map<string, DOMRect>();
    const changed = lastSignature.current !== null && lastSignature.current !== signature;

    // Скільки карток з'явилось або пішло цим разом. Якщо багато — це не дія
    // людини над карткою, а перебудова списку (фільтр, пошук, перезавантаження),
    // і рух там лише заважає. Див. BULK_CHANGE_LIMIT.
    let churn = 0;
    rows.forEach((row) => {
      const key = row.dataset.kanbanRow;
      if (!key) return;
      if (row.dataset.leaving === "true" || !rects.current.has(key)) churn += 1;
    });

    const hasGhost = rows.some((row) => row.dataset.leaving === "true");
    // Кадр, у якому привид щойно прибрали: сусіди вже на своїх місцях —
    // згортання висоти привело їх туди плавно. Анімувати тут нічого, лишається
    // тільки перезаписати позиції.
    const ghostJustLeft = hadGhost.current && !hasGhost;

    const animate =
      changed &&
      !ghostJustLeft &&
      churn <= BULK_CHANGE_LIMIT &&
      !skipChoreography &&
      !prefersReducedMotion();

    rows.forEach((row) => {
      const key = row.dataset.kanbanRow;
      if (!key) return;
      const rect = row.getBoundingClientRect();
      next.set(key, rect);
      if (!animate) return;

      const previous = rects.current.get(key);

      if (row.dataset.leaving === "true") {
        // Згортаємо РЯДОК, а не картку: висота, що меншає, сама тягне за собою
        // сусідів знизу — окремо їх рухати не треба.
        const height = previous?.height ?? rect.height;
        row.animate(
          [
            { height: `${height}px`, opacity: 1, scale: "1" },
            { height: "0px", opacity: 0, scale: "0.96" },
          ],
          { duration: EXIT_MS, easing: EASE_EXIT, fill: "forwards" }
        );
        return;
      }

      if (!previous) {
        row.animate(
          [
            { opacity: 0, transform: "scale(0.97) translateY(-4px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: ENTER_MS, easing: EASE_MOVE }
        );
        return;
      }

      const dx = previous.left - rect.left;
      const dy = previous.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      if (Math.abs(dx) > MAX_MOVE_PX || Math.abs(dy) > MAX_MOVE_PX) return;

      row.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: MOVE_MS,
        easing: EASE_MOVE,
      });
    });

    rects.current = next;
    lastSignature.current = signature;
    hadGhost.current = hasGhost;
  }, [containerRef, signature]);
}
