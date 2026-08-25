import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { HeroShell, SplitBar } from "@/components/app/bento";
import { PageLoading } from "@/components/app/page-loading";
import { PullToRefresh } from "@/components/app/PullToRefresh";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Badge } from "@/components/ui/badge";
import { formatLastSeenAgo } from "@/lib/lastSeen";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { usePageData } from "@/hooks/usePageData";

import { buildOverview } from "@/features/overview/buildOverview";
import { OverviewAside } from "@/features/overview/OverviewAside";
import { OverviewQueue } from "@/features/overview/OverviewQueue";
import { createEmptyOverviewData, loadOverviewData, type OverviewData } from "@/features/overview/overviewData";
import { resolveOverviewLens } from "@/features/overview/overviewRoles";

/**
 * «Огляд» — сторінка, що відповідає на питання «що мені зараз робити».
 *
 * ЩО ТУТ ЗМІНИЛОСЬ І ЧОМУ (REQ-151). До серпня 2026 сторінка була однією на
 * всіх: чотири плитки з числами, під ними списки по модулях, а вся
 * персоналізація зводилась до прапорця «керівник / решта». Дизайнер,
 * бухгалтер і логіст відкривали її й бачили воронку прорахунків, до якої не
 * мали стосунку. Заразом вона лишилась у ранньому вигляді — радіуси 30px,
 * радіальні градієнти й розмиті кулі, — тоді як решта застосунку давно
 * говорить мовою «Стеку» й «Витрат».
 *
 * ТЕПЕР: герой із великим числом і смугою терміновості, під ним ЧЕРГА СПРАВ,
 * праворуч — вузька колонка контексту. Наповнення черги залежить від погляду
 * (`overviewRoles.ts`), а правила «що вважати терміновим» живуть у чистій
 * функції `buildOverview.ts` під тестами.
 *
 * ЧОМУ СТОРІНКА ТАКА ТОНКА. Уся її робота — прочитати дані, вибрати погляд і
 * скласти вигляд. Жодного правила про терміновість тут немає навмисно: у
 * файлі сторінки їх не перевіриш тестом, а помилка в них означає, що людині
 * показали спокій там, де горить.
 */

const greetingFor = (hour: number) => {
  if (hour < 5) return "Доброї ночі";
  if (hour < 12) return "Доброго ранку";
  if (hour < 18) return "Доброго дня";
  return "Доброго вечора";
};

/**
 * Ім'я в привітанні свідомо не звучить.
 *
 * «Доброго ранку, Олеже» вимагає кличного відмінка, а він у CRM ніде не
 * рахується — у застосунку діє правило «імена лише в називному». Привітання
 * без імені завжди правильне; привітання з ім'ям у називному («Доброго ранку,
 * Олег») читається як помилка, і саме за це вже прилітало на панелі дій
 * дизайн-задачі.
 */
export function OverviewPage() {
  const { teamId, userId, accessRole, jobRole } = useAuth();

  const lens = useMemo(() => resolveOverviewLens({ accessRole, jobRole }), [accessRole, jobRole]);

  /*
   * Сторінка оновлюється САМА, і саме тому тут немає кнопки «Оновити».
   *
   * Вона тут була, і причина була не в інтерфейсі, а в шарі даних: із
   * `backgroundRefetch: false` протухлий кеш не перечитувався НІКОЛИ — ні при
   * вході в розділ, ні згодом. Тобто число «6 затиків» могло висіти з учора, і
   * єдиним способом побачити правду був натиск кнопки. Кнопка закривала діру,
   * а не давала можливість.
   *
   * Тепер: застарілий кеш дочитується мовчки при вході (`backgroundRefetch`) і
   * при поверненні до вкладки (`refetchOnFocus`) — без каркаса й стрибка, бо
   * на екрані вже є що показувати. Вік даних видно підписом у шапці, а на
   * телефоні лишається звичний жест «потягнути вниз».
   */
  const isNarrow = useIsNarrowViewport();
  const { data, loading, showSkeleton, updatedAt, refetch } = usePageData<OverviewData>({
    cacheKey: `overview:${teamId ?? "none"}:${userId ?? "none"}:${lens}`,
    loadFn: () => loadOverviewData({ teamId, userId }),
    cacheTTL: 10 * 60 * 1000,
    showSkeletonOnStale: false,
    backgroundRefetch: true,
    refetchOnFocus: true,
  });

  // Хвилинний тік — щоб підпис «щойно» не залишався «щойно» пів години.
  const [, forceAgeTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceAgeTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const safeData = data ?? createEmptyOverviewData();

  // Час зрізу беремо один раз на порцію даних, а не на кожен рендер: інакше
  // «прострочено 3 дні» перераховувалось би посеред читання сторінки.
  const view = useMemo(
    () =>
      buildOverview({
        now: new Date(),
        userId,
        lens,
        quotes: safeData.quotes,
        designTasks: safeData.designTasks,
        activityCount: safeData.activity.length,
      }),
    [safeData, userId, lens]
  );

  const now = new Date();
  const dateLine = now.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });

  // `background: true` — оновлення БЕЗ каркаса: інакше на пів секунди зникало б
  // рівно те, що людина щойно тягнула пальцем.
  const handlePullRefresh = useCallback(() => refetch({ background: true }), [refetch]);

  if (showSkeleton || loading) {
    return <PageLoading />;
  }

  return (
    <PageCanvas>
      <PageCanvasBody className="min-w-0 pb-16 md:pb-8">
        {/* Жест лише на телефоні: мишею тягнути нема чим, а слухачі дотиків на
            десктопі все одно ніколи б не спрацювали. */}
        <PullToRefresh onRefresh={handlePullRefresh} enabled={isNarrow}>
        {/* Та сама ширина, що в «Релізах» і «Стеку»: дві колонки, а не суцільний
            текст, тож 1600px колонка макета була б завеликою. */}
        {/* grid-cols-1, а не просто grid: без явної колонки неявний трек має розмір
            max-content, і на 375px сітка роздувається під найширший рядок замість
            того, щоб його стиснути. Саме через це на телефоні зрізало правий край. */}
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-4">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {greetingFor(now.getHours())}
            </h1>
            <p className="text-xs text-muted-foreground">{dateLine}</p>
            <Badge tone="neutral" size="sm" className="hidden sm:inline-flex">
              {view.lensLabel}
            </Badge>
            {updatedAt ? (
              <span className="ml-auto text-2xs text-muted-foreground/80">
                {formatLastSeenAgo(new Date(updatedAt).toISOString())}
              </span>
            ) : null}
          </header>

          <HeroShell
            label={view.hero.label}
            value={view.hero.value}
            suffix={view.hero.suffix}
            badge={
              view.hero.badge ? (
                <Badge tone={view.hero.badge.tone} size="sm">
                  {view.hero.badge.text}
                </Badge>
              ) : null
            }
            footnote={view.hero.foot.map((fact) => (
              <span key={fact.label} className="inline-flex items-baseline gap-1.5">
                <span className="figure font-medium text-foreground">{fact.value}</span>
                <span>{fact.label}</span>
              </span>
            ))}
          >
            <SplitBar parts={view.hero.split} className="mt-4" />
          </HeroShell>

          {/* Одна колонка до lg — черга мусить бути першим, що видно на телефоні,
              а контекст стає рядом карток під нею. Другої гілки розмітки немає
              навмисно: React комітить обидві, скільки б `hidden` на них не було. */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
            <OverviewQueue items={view.queue} total={view.queueTotal} emptyText={view.hero.emptyText} />
            <OverviewAside
              cards={view.aside}
              activity={safeData.activity}
              className="sm:grid-cols-2 lg:grid-cols-1"
            />
          </div>
        </div>
        </PullToRefresh>
      </PageCanvasBody>
    </PageCanvas>
  );
}
