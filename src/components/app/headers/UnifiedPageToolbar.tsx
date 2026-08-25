import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";

type UnifiedPageToolbarProps = {
  topLeft?: ReactNode;
  topRight?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  meta?: ReactNode;
  className?: string;
  topRowClassName?: string;
  topLeftClassName?: string;
  topRightClassName?: string;
  bottomRowClassName?: string;
  searchClassName?: string;
  filtersClassName?: string;
  metaClassName?: string;
  /**
   * Компактний тулбар на телефоні (картка 146).
   *
   * Десктопні слоти стають вертикальним стосом контролів на всю ширину, і на
   * сторінці прорахунків це давало 461px обв'язки до першої картки — понад
   * половину екрана 812px. У компактному режимі поруч лишаються тільки пошук
   * і кнопка «Фільтри»; `topLeft`, `filters` і `meta` переїжджають в аркуш.
   *
   * Вмикається сторінкою свідомо: решті сторінок мобільний вигляд не
   * змінюється, поки їх не перевірять окремо.
   */
  mobileCompact?: boolean;
  /**
   * Що лишається в компактному рядку поруч із пошуком — зазвичай головна дія
   * («Новий прорахунок») в іконковому вигляді. `topRight` на телефоні при
   * цьому НЕ рендериться взагалі: інакше та сама кнопка стояла б двічі.
   */
  mobilePrimary?: ReactNode;
  /** Скільки фільтрів застосовано — бейдж на кнопці «Фільтри». */
  mobileFilterCount?: number;
  /**
   * Перемикач вигляду (Список / Канбан) для аркуша.
   *
   * На десктопі він живе всередині `topRight`, який на телефоні не
   * рендериться; передається окремо, щоб вибір вигляду не зник на мобільному.
   * Той самий вузол можна віддати в обидва слоти — одночасно вони не існують.
   */
  mobileViewSwitch?: ReactNode;
  /**
   * Другорядні дії сторінки для аркуша.
   *
   * `topRight` на телефоні не рендериться, а дій там буває більше за одну —
   * на «Команді» це «Звіт», «Квоти», «Свята» й «Внести за когось». Головна
   * лишається в рядку (`mobilePrimary`), решта живе тут.
   */
  mobileExtraActions?: ReactNode;
};

export function UnifiedPageToolbar({
  topLeft,
  topRight,
  search,
  filters,
  meta,
  className,
  topRowClassName,
  topLeftClassName,
  topRightClassName,
  bottomRowClassName,
  searchClassName,
  filtersClassName,
  metaClassName,
  mobileCompact = false,
  mobilePrimary,
  mobileFilterCount = 0,
  mobileViewSwitch,
  mobileExtraActions,
}: UnifiedPageToolbarProps) {
  const isNarrow = useIsNarrowViewport();
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Тернарник, а не `md:hidden`: React комітить обидві гілки, і десктопний
  // стос контролів жив би в DOM телефона (принцип картки 146).
  if (mobileCompact && isNarrow) {
    const hasSheetContent = Boolean(topLeft || filters || mobileViewSwitch || mobileExtraActions);

    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2">
          {search ? <div className="min-w-0 flex-1">{search}</div> : null}
          {hasSheetContent ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setFiltersOpen(true)}
              aria-label="Фільтри та вигляд"
              // h-11 = 44px: мінімальний тач-таргет.
              className="relative h-11 shrink-0 gap-2 px-3"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {mobileFilterCount > 0 ? (
                <span className="min-w-5 rounded-full bg-primary px-1.5 text-2xs font-semibold leading-5 text-primary-foreground">
                  {mobileFilterCount}
                </span>
              ) : null}
            </Button>
          ) : null}
          {mobilePrimary}
        </div>

        {hasSheetContent ? (
          <BottomSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Фільтри та вигляд">
            <div className="space-y-4">
              {mobileViewSwitch ? (
                <div className="min-w-0">
                  <p className="pb-2 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Вигляд
                  </p>
                  {mobileViewSwitch}
                </div>
              ) : null}
              {topLeft ? <div className="min-w-0">{topLeft}</div> : null}
              {filters ? <div className="flex min-w-0 flex-col gap-2">{filters}</div> : null}
              {mobileExtraActions ? (
                <div className="min-w-0">
                  <p className="pb-2 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Дії
                  </p>
                  <div className="flex min-w-0 flex-col gap-2">{mobileExtraActions}</div>
                </div>
              ) : null}
              {/*
               * `meta` (лічильник знайденого + скидання) в аркуші НЕ показуємо.
               * Скільки всього знайшлось, видно на самій сторінці — у смузі
               * статусів і в списку; дублювати це в панелі фільтрів означало
               * додати рядок, який нічого не вирішує.
               */}
            </div>
          </BottomSheet>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {(topLeft || topRight) ? (
        <div
          className={cn(
            "flex flex-col gap-3 lg:flex-row lg:items-center",
            topLeft && topRight ? "lg:justify-between" : topRight ? "lg:justify-end" : undefined,
            topRowClassName
          )}
        >
          {topLeft ? <div className={cn("min-w-0", topLeftClassName)}>{topLeft}</div> : null}
          {topRight ? (
            <div
              className={cn(
                "flex w-full flex-col gap-2 self-stretch sm:flex-row sm:items-center sm:justify-end lg:w-auto lg:self-auto",
                topRightClassName
              )}
            >
              {topRight}
            </div>
          ) : null}
        </div>
      ) : null}

      {(search || filters || meta) ? (
        <div className={cn("flex flex-col gap-3 xl:flex-row xl:items-center", bottomRowClassName)}>
          {search ? (
            <div className={cn("w-full xl:max-w-[370px] xl:flex-none", searchClassName)}>
              {search}
            </div>
          ) : null}
          {filters ? (
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center",
                filtersClassName
              )}
            >
              {filters}
            </div>
          ) : null}
          {meta ? (
            <div className={cn("flex items-center gap-2 xl:ml-auto xl:flex-none", metaClassName)}>{meta}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
