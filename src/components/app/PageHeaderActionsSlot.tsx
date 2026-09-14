import * as React from "react";

import { useSkeletonVisible } from "@/components/app/loadingHandoff";
import { usePageHeaderActionsNode } from "@/components/app/pageHeaderActionsContext";
import { PageToolbarSkeleton } from "@/components/app/page-loading";
import { useTimeoutFlag } from "@/hooks/useTimeoutFlag";
import { recallToolbarHeight, rememberToolbarHeight } from "@/layout/toolbarHeights";
import type { PageToolbarKind } from "@/layout/pageSurfaces";
import { cn } from "@/lib/utils";

/**
 * СЛОТИ — ЦЕ ВСЯ СУТЬ ПРАВКИ (REQ-135).
 *
 * Вузол дій міняється на кожну літеру в пошуку. Поки його читала оболонка на
 * 2800 рядків, разом із нею перемальовувалась і сторінка: 24 зайві рендери з 60
 * на серії з 14 літер. Тепер вузол читають лише ці два маленькі компоненти —
 * усе, що вони коштують, це вони самі.
 *
 * Оболонці лишається присутність (`usePageHeaderActionsPresence`) — факт, який
 * міняється, коли сторінка приходить, іде або міняє поверхню, а не коли людина
 * набирає в пошуку.
 */

/**
 * Смуга дій під шапкою застосунку разом із її каркасом.
 *
 * ЧОМУ ПАДІНГИ ВСЕРЕДИНІ, А НЕ НА <main>. Смуга йде на всю ширину контентної
 * колонки — від сайдбара до правого краю, — а бічні відступи живуть на
 * внутрішніх обгортках. Якби вони були на <main>, роздільник обрізався б по
 * краях max-width.
 *
 * РЕЗЕРВ ВИСОТИ (REQ-19). Смуга стоїть від першого кадру маршруту, а не
 * з'являється тоді, коли сторінка нарешті віддала кнопки. Раніше умова була
 * «немає заголовка сторінки && є дії» — тобто смуга з'являлась після монтування
 * сторінки, і весь контент під нею стрибав униз; на переході стрибок був
 * подвійний, бо стара смуга спершу зникала.
 *
 * Поки кнопок немає, місце тримає каркас тулбара: він рахує ту саму висоту, тож
 * нічого підбирати в пікселях не треба. Перші 150 мс він прозорий — при швидкому
 * переході людина не бачить ні порожнечі, ні зайвого сірого кадру, лише готовий
 * тулбар.
 */
/**
 * Остання опублікована висота смуги.
 *
 * Запис змінної на <html> інвалідує стилі всього документа: на дошці прорахунків
 * це ~25 мс перерахунку стилів і ще стільки ж верстки — за КОЖЕН запис. Раніше
 * смуга писала її на кожному своєму рендері (тобто на кожну літеру в пошуку)
 * і на кожному тику спостерігача, навіть коли число не мінялось. Тепер запис
 * іде лише на справжню зміну; між сторінками з однаковою смугою його немає.
 */
let publishedToolbarHeight: number | null = null;

function publishToolbarHeight(height: number | null) {
  const next = height === null ? null : Math.round(height);
  if (next === publishedToolbarHeight) return;
  publishedToolbarHeight = next;
  if (next === null) {
    document.documentElement.style.removeProperty("--page-toolbar-height");
  } else {
    document.documentElement.style.setProperty("--page-toolbar-height", `${next}px`);
  }
}

export function PageHeaderToolbarSlot({
  surfaceId,
  kind,
  canvasMode,
  chrome = "shown",
}: {
  surfaceId: string | null;
  kind: PageToolbarKind;
  canvasMode: boolean;
  /** Разом із шапкою: `hidden` — з'їхати вгору при прокрутці вниз. */
  chrome?: "shown" | "hidden";
}) {
  const actions = usePageHeaderActionsNode(surfaceId);
  const pending = kind !== "none" && !actions;
  /**
   * Каркас тулбара живе за тими самими правилами, що й каркас вмісту: перший в
   * естафеті чекає 150 мс, наступні підхоплюють миттєво. Інакше на холодному
   * вході смуга встигала проявитись і згаснути між двома фазами завантаження.
   */
  const showSkeleton = useSkeletonVisible(pending);
  /**
   * Сторінка може й не змонтуватись зовсім: гейт доступу покаже «потрібен
   * доступ», обгортка — «немає команди». Кнопок у такому разі не буде ніколи,
   * тож через кілька секунд резерв знімаємо — інакше над повідомленням вічно
   * мерехтів би каркас тулбара.
   */
  const abandoned = useTimeoutFlag(pending, 6000);
  /**
   * Перший показ тулбара — це замір. Далі резервуємо рівно стільки, скільки він
   * справді займає на цій сторінці й при цій ширині вікна.
   */
  const nodeRef = React.useRef<HTMLDivElement | null>(null);
  /**
   * Зовнішня смуга — САМЕ ВОНА липка, і саме її висоту мають знати липкі шапки
   * таблиць.
   *
   * Спершу висоту брали з внутрішнього вузла (`nodeRef`) — того, що тримає
   * відступи, — і виходило 96 px замість справжніх 121: поза заміром лишались
   * власні поля смуги й нижня межа. Заголовок таблиці прилипав на 25 px вище,
   * ніж треба, і заїжджав під смугу. Тепер міряємо те, що справді займає місце.
   *
   * Каркас (`rememberToolbarHeight`) і далі рахує внутрішній вузол: він резервує
   * місце під ВМІСТ, і межа з відступами йому не потрібна.
   */
  const bandRef = React.useRef<HTMLDivElement | null>(null);

  /*
   * ОБИДВА ЗАМІРИ — ЛИШЕ ЧЕРЕЗ ResizeObserver, БЕЗ СИНХРОННОГО ЧИТАННЯ (REQ-274).
   *
   * `node.offsetHeight` просто в layout-ефекті змушує браузер порахувати стилі
   * й верстку ВСІЄЇ щойно змонтованої сторінки посеред коміту React. На дошці
   * прорахунків це 40–80 мс на кожне читання, і саме ці читання тримали екран
   * після кліку по сайдбару: людина натискала «Прорахунки» й ще чверть секунди
   * (на повільнішій машині — секунду) дивилась на попередню сторінку.
   *
   * ResizeObserver віддає те саме число сам — одразу після верстки й ще до
   * першого кадру, тож ні резерв каркаса, ні липкі шапки таблиць нічого не
   * втрачають, а примусового перерахунку немає.
   */
  const hasActions = Boolean(actions);
  React.useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || !hasActions || !surfaceId || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      rememberToolbarHeight(surfaceId, node.offsetHeight);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasActions, surfaceId]);

  const rendersBand = kind !== "none" && !(abandoned && !actions);
  React.useLayoutEffect(() => {
    const band = bandRef.current;
    if (!band || !rendersBand || typeof ResizeObserver === "undefined") return;
    /*
     * Висота смуги потрібна липким шапкам таблиць: без цієї цифри thead
     * прилипав би під шапкою застосунку й ховався за смугою на чотирьох
     * сторінках (Прорахунки, Замовлення, Склад, Підрядники). Тримаємо в
     * CSS-змінній на корені, бо читає її зовсім інший компонент.
     *
     * Смуга живе в макеті й між розділами не перемонтовується, тож спостерігач
     * тут один на весь сеанс: він озивається лише тоді, коли смуга справді
     * змінила висоту, а не на кожен рендер слота.
     */
    const observer = new ResizeObserver(() => publishToolbarHeight(band.offsetHeight));
    observer.observe(band);
    return () => {
      observer.disconnect();
      // Прибираємо за собою: на сторінці без смуги стара цифра відсунула б
      // заголовок таблиці вниз на висоту тулбара, якого там немає.
      publishToolbarHeight(null);
    };
  }, [rendersBand]);
  const reservedHeight = recallToolbarHeight(surfaceId);

  if (!rendersBand) return null;

  return (
    // На телефоні смуга тулбара — це один рядок «пошук + фільтри + дія», і
    // відбивати його ще й лінією нема від чого: далі одразу йде смуга
    // статусів, яка й так читається окремим шаром. Відступи там же вужчі:
    // ряд порожнечі над списком коштував екранного місця ні за що
    // (картка 146). Десктоп лишається як був.
    <div
      ref={bandRef}
      className={cn(
        "border-b border-[hsl(var(--app-structure-divider))] bg-[hsl(var(--page-underlay-bg)/0.72)] max-md:border-b-0 supports-[backdrop-filter]:backdrop-blur-md",
        /*
         * СМУГА ЛИПНЕ ПІД ШАПКОЮ — і ховається разом із нею (патерн headroom,
         * див. useScrollDirection). Крутиш униз — обидві їдуть угору й
         * звільняють екран; крутиш угору — повертаються, не чекаючи, поки
         * долистаєш до початку списку.
         *
         * `--app-header-height` — та сама змінна, на якій стоять липкі шапки
         * таблиць: вона вже враховує смугу «Дивитись як». Своє число тут
         * розійшлося б із нею мовчки.
         *
         * z-20, а не вище: шапка застосунку лишається над смугою, дровери й
         * модалки — тим паче. Заливка обов'язкова: інакше рядки списку
         * просвічують крізь смугу під час прокрутки.
         */
        "sticky top-[var(--app-header-height)] z-20",
        /*
         * ЇДЕ РІВНО НА ВЛАСНУ ВИСОТУ й ховається під шапкою (та лишається на
         * місці, z-30). Перша версія відвозила смугу ще й на висоту шапки —
         * тобто вдвічі далі, ніж треба, — і рух читався як ривок кудись убік
         * від екрана.
         *
         * Заразом гасимо прозорість. Шапка напівпрозора з розмиттям, тож без
         * цього крізь неї просвічувала б смуга, що проїжджає, — саме та каша,
         * яку видно було під час прокрутки. Прозорість згасає швидше за рух,
         * щоб смуга зникала ДО того, як дійде до шапки.
         *
         * `pointer-events-none` у схованому стані: інакше невидима смуга
         * ловила б кліки по верхніх рядках списку.
         */
        "transition-[transform,opacity] duration-base ease-out motion-reduce:transition-none",
        chrome === "hidden"
          ? "pointer-events-none -translate-y-full opacity-0 duration-base"
          : "translate-y-0 opacity-100"
      )}
    >
      <div
        className={cn(
          "min-w-0",
          canvasMode
            ? "px-4 py-3 max-md:py-2 md:px-5 lg:px-6"
            // pt-5 — те саме повітря над смугою, яке раніше давав відступ
            // <main> (76px = 57 під шапку + 19). Тепер воно всередині смуги й
            // їде разом із нею, тож при прилипанні нічого не підстрибує.
            : "mx-auto w-full max-w-[1600px] px-4 pb-4 pt-5 max-md:pb-2 max-md:pt-3 md:px-5 lg:px-6"
        )}
      >
        {actions ? (
          <div ref={nodeRef}>{actions}</div>
        ) : (
          <div
            className={cn(
              "transition-opacity duration-base",
              showSkeleton ? "opacity-100" : "opacity-0"
            )}
            // Заміряна висота цієї ж поверхні, якщо ми її вже бачили;
            // інакше працює оцінка за класом тулбара.
            style={reservedHeight ? { minHeight: reservedHeight } : undefined}
          >
            <PageToolbarSkeleton kind={kind} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Дії поруч із заголовком у контентній колонці — для сторінок, які малюють
 * власний заголовок замість окремої смуги.
 */
export function PageHeaderInlineActionsSlot({ surfaceId }: { surfaceId: string | null }) {
  const actions = usePageHeaderActionsNode(surfaceId);
  if (!actions) return null;
  return <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>;
}
