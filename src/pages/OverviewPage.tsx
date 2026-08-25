import { useMemo } from "react";
import { RefreshCw } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { HeroShell, SplitBar } from "@/components/app/bento";
import { PageLoading } from "@/components/app/page-loading";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const { data, loading, showSkeleton, refetch } = usePageData<OverviewData>({
    cacheKey: `overview:${teamId ?? "none"}:${userId ?? "none"}:${lens}`,
    loadFn: () => loadOverviewData({ teamId, userId }),
    cacheTTL: 10 * 60 * 1000,
    showSkeletonOnStale: false,
    backgroundRefetch: false,
  });

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

  if (showSkeleton || loading) {
    return <PageLoading />;
  }

  return (
    <PageCanvas>
      <PageCanvasBody className="min-w-0 pb-16 md:pb-8">
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
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 gap-1.5"
              onClick={() => {
                void refetch();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {/* На телефоні лишається сама іконка: із написом кнопка не влазить
                  у рядок із привітанням і датою й з'їжджає на власний рядок,
                  лишаючи під собою смугу порожнечі на всю ширину. */}
              <span className="hidden sm:inline">Оновити</span>
            </Button>
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
      </PageCanvasBody>
    </PageCanvas>
  );
}
