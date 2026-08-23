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
export function PageHeaderToolbarSlot({
  surfaceId,
  kind,
  canvasMode,
}: {
  surfaceId: string | null;
  kind: PageToolbarKind;
  canvasMode: boolean;
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
  React.useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || !actions || !surfaceId) return;
    rememberToolbarHeight(surfaceId, node.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      rememberToolbarHeight(surfaceId, node.offsetHeight);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [actions, surfaceId]);
  const reservedHeight = recallToolbarHeight(surfaceId);

  if (kind === "none" || (abandoned && !actions)) return null;

  return (
    <div className="border-b border-[hsl(var(--app-structure-divider))] bg-[hsl(var(--page-underlay-bg)/0.72)] supports-[backdrop-filter]:backdrop-blur-md">
      <div
        className={cn(
          "min-w-0",
          canvasMode
            ? "px-4 py-3 md:px-5 lg:px-6"
            : "mx-auto w-full max-w-[1600px] px-4 pb-4 md:px-5 lg:px-6"
        )}
      >
        {actions ? (
          <div ref={nodeRef}>{actions}</div>
        ) : (
          <div
            className={cn(
              "transition-opacity duration-200",
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
