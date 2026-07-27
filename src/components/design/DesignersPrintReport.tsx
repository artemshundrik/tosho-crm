import { Fragment } from "react";
import { DESIGN_TASK_TYPE_NORM_MINUTES, DESIGN_TASK_TYPE_OPTIONS } from "@/lib/designTaskType";
import {
  avgSecondsForType,
  avgSecondsPerTask,
  revisionsPerTask,
  type DesignerAnalytics,
  type DesignerMonthAgg,
} from "@/lib/designerAnalytics";
import type { MonthNormPlan } from "@/lib/designerPayroll";
import { formatHM, formatHours, formatHumanSeconds, monthTitle } from "@/lib/designerAnalyticsFormat";

/**
 * Друковані звіти по дизайнерах — рівно ОДНА сторінка A4 кожен.
 *
 * Їх два, бо на місячному розборі це дві різні розмови:
 *  · `time` — як працювали: задачі, години, середній час за типами, якість
 *    обліку часу;
 *  · `output` — що зробили: унікальні роботи проти денної норми, з чого вона
 *    складається і скільки виходить понад норму.
 * Другий звіт тримає числа, за якими рахується зарплата, тож він друкується
 * тільки тоді, коли глядачеві віддали норми (RLS) — інакше секції норм просто
 * не буде.
 *
 * Чому окремий компонент, а не «надрукувати дашборд»: екранний дашборд має
 * скроли, теплові заливки й інтерактив, які на папері або не вміщаються, або
 * не друкуються (браузери за замовчуванням не друкують фони). Тут — стисла
 * табличка на тексті й тонких лініях: читається і в ЧБ.
 *
 * Кольори/бордери живуть у .print-report (index.css), а не в Tailwind-класах:
 * палітра звіту фіксовано «паперова» й не залежить від теми застосунку.
 *
 * Верстка тримається в межах 190×277 мм (A4 мінус поля 10 мм). Якщо додаватимеш
 * секції — перевір друк: усе, що не влізло, поїде на другу сторінку.
 */

export type PrintReportVariant = "time" | "output";

type Props = {
  analytics: DesignerAnalytics;
  monthIndex: number;
  designers: Array<{ id: string; label: string }>;
  variant: PrintReportVariant;
  /** userId → monthKey → норма. Порожня — секції норм не буде. */
  normPlans: Map<string, Map<string, MonthNormPlan>>;
};

export function DesignersPrintReport({ analytics, monthIndex, designers, variant, normPlans }: Props) {
  const month = analytics.months[monthIndex];
  if (!month) return null;

  const rows = designers
    .map((designer) => ({ designer, agg: analytics.perDesigner.get(designer.id)?.[monthIndex] ?? null }))
    .filter((entry): entry is { designer: Props["designers"][number]; agg: DesignerMonthAgg } => !!entry.agg);
  const team = analytics.team[monthIndex] ?? null;

  const printedAt = new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });

  const untimedFor = (designerId: string) =>
    (analytics.works.get(`${designerId}:${monthIndex}`) ?? []).filter((group) => group.taskTrackedSeconds === 0).length;

  const header = (
    <header className="print-report__rule mb-3 flex items-baseline justify-between pb-1.5">
      <div>
        <h1 className="text-[15pt] font-bold leading-tight">
          {variant === "time" ? "Статистика дизайнерів" : "Виробіток дизайнерів"}
        </h1>
        <p className="print-report__sub text-[9pt]">
          {monthTitle(month.value)} · {variant === "time" ? "час і задачі" : "роботи проти норми"}
        </p>
      </div>
      <p className="print-report__meta text-[8pt]">ToSho CRM · надруковано {printedAt}</p>
    </header>
  );

  if (rows.length === 0) {
    return (
      <div className="print-report mx-auto w-full max-w-[190mm]">
        {header}
        <p className="text-[10pt]">За цей місяць немає даних.</p>
      </div>
    );
  }

  /* ======================= ЗВІТ 2: ВИРОБІТОК ======================= */
  if (variant === "output") {
    const planFor = (designerId: string) => normPlans.get(designerId)?.get(month.value) ?? null;
    const hasNorms = rows.some(({ designer }) => planFor(designer.id));

    return (
      <div className="print-report mx-auto w-full max-w-[190mm]">
        {header}

        <section className="mb-3">
          <h2 className="mb-1 text-[10pt] font-bold uppercase tracking-wide">Роботи проти норми</h2>
          <table className="text-[9pt]">
            <thead>
              <tr>
                <th className="text-left">Дизайнер</th>
                <th className="text-center">Нормо-дні</th>
                <th className="text-center">Візуали</th>
                <th className="text-center">Норма</th>
                <th className="text-center">Понад</th>
                <th className="text-center">Макети</th>
                <th className="text-center">Норма</th>
                <th className="text-center">Понад</th>
                <th className="text-center">Разом робіт</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ designer, agg }) => {
                const plan = planFor(designer.id);
                const overVisual = plan ? Math.max(0, agg.worksByKind.visualization - plan.visualNorm) : 0;
                const overLayout = plan ? Math.max(0, agg.worksByKind.layout - plan.layoutNorm) : 0;
                return (
                  <tr key={designer.id}>
                    <td className="text-left">{designer.label}</td>
                    <td className="text-center tabular-nums">{plan ? plan.normDays : "—"}</td>
                    <td className="text-center font-semibold tabular-nums">{agg.worksByKind.visualization}</td>
                    <td className="print-report__muted text-center tabular-nums">{plan ? plan.visualNorm : "—"}</td>
                    <td className="text-center tabular-nums">{overVisual > 0 ? `+${overVisual}` : "—"}</td>
                    <td className="text-center font-semibold tabular-nums">{agg.worksByKind.layout}</td>
                    <td className="print-report__muted text-center tabular-nums">{plan ? plan.layoutNorm : "—"}</td>
                    <td className="text-center tabular-nums">{overLayout > 0 ? `+${overLayout}` : "—"}</td>
                    <td className="text-center font-semibold tabular-nums">{agg.works}</td>
                  </tr>
                );
              })}
              {team ? (
                <tr>
                  <td className="text-left font-semibold">Команда</td>
                  <td className="print-report__muted text-center tabular-nums">—</td>
                  <td className="text-center font-semibold tabular-nums">{team.worksByKind.visualization}</td>
                  <td className="print-report__muted text-center tabular-nums">—</td>
                  <td className="text-center tabular-nums">—</td>
                  <td className="text-center font-semibold tabular-nums">{team.worksByKind.layout}</td>
                  <td className="print-report__muted text-center tabular-nums">—</td>
                  <td className="text-center tabular-nums">—</td>
                  <td className="text-center font-semibold tabular-nums">{team.works}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {!hasNorms ? (
            <p className="print-report__meta mt-1 text-[7.5pt]">
              Норми не показані: ставки не призначені або немає доступу до них.
            </p>
          ) : null}
        </section>

        <section className="mb-3">
          <h2 className="mb-1 text-[10pt] font-bold uppercase tracking-wide">З чого складається виробіток</h2>
          <table className="text-[9pt]">
            <thead>
              <tr>
                <th className="text-left">Тип задачі</th>
                {rows.map(({ designer }) => (
                  <th key={designer.id} className="text-center" colSpan={3}>
                    {designer.label}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="text-left text-[8pt] font-normal">&nbsp;</th>
                {rows.map(({ designer }) => (
                  <Fragment key={designer.id}>
                    <th className="text-center text-[8pt] font-normal">робіт</th>
                    <th className="text-center text-[8pt] font-normal">віз</th>
                    <th className="text-center text-[8pt] font-normal">мак</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {DESIGN_TASK_TYPE_OPTIONS.map((option) => (
                <tr key={option.value}>
                  <td className="text-left">{option.label}</td>
                  {rows.map(({ designer, agg }) => {
                    const cell = agg.worksByType[option.value];
                    return (
                      <Fragment key={designer.id}>
                        <td className="text-center font-semibold tabular-nums">{cell.works || "—"}</td>
                        <td className="print-report__muted text-center tabular-nums">{cell.visualization || "—"}</td>
                        <td className="print-report__muted text-center tabular-nums">{cell.layout || "—"}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
              {rows.some(({ agg }) => agg.worksByType.none.works > 0) ? (
                <tr>
                  <td className="print-report__muted text-left">Без типу</td>
                  {rows.map(({ designer, agg }) => (
                    <Fragment key={designer.id}>
                      <td className="text-center tabular-nums">{agg.worksByType.none.works || "—"}</td>
                      <td className="print-report__muted text-center tabular-nums">
                        {agg.worksByType.none.visualization || "—"}
                      </td>
                      <td className="print-report__muted text-center tabular-nums">
                        {agg.worksByType.none.layout || "—"}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="mb-3">
          <h2 className="mb-1 text-[10pt] font-bold uppercase tracking-wide">Якість обліку</h2>
          <table className="text-[9pt]">
            <thead>
              <tr>
                <th className="text-left">Показник</th>
                {rows.map(({ designer }) => (
                  <th key={designer.id} className="text-center">
                    {designer.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-left">Файлів залито</td>
                {rows.map(({ designer, agg }) => (
                  <td key={designer.id} className="text-center tabular-nums">
                    {agg.files}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-left">З них унікальних робіт</td>
                {rows.map(({ designer, agg }) => (
                  <td key={designer.id} className="text-center font-semibold tabular-nums">
                    {agg.works}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-left">Перезаливи й другий формат</td>
                {rows.map(({ designer, agg }) => (
                  <td key={designer.id} className="print-report__muted text-center tabular-nums">
                    {Math.max(0, agg.files - agg.works)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-left">Робіт без таймера</td>
                {rows.map(({ designer }) => (
                  <td key={designer.id} className="text-center tabular-nums">
                    {untimedFor(designer.id) || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="print-report__footnote pt-1.5 text-[7.5pt] leading-snug">
          Одиниця виробітку — унікальна робота: задача + назва файлу без розширення. Тому .ai і .pdf одного макета це
          одна робота, а перезалив після правок нової роботи не додає. Вид береться з розділу «Результат»:
          «візуалізація» — візуал, решта — макет; кріплення до задач не рахуються. Норма денна й множиться на робочі
          дні за вирахуванням відпусток і лікарняних. З серпня 2026 робота, всі файли якої видалили в тому ж місяці,
          не рахується; видалене пізніше — лишається зарахованим, щоб закриті місяці не змінювались заднім числом.
        </footer>
      </div>
    );
  }

  /* ======================= ЗВІТ 1: ЧАС І ЗАДАЧІ ======================= */

  // Топ-6 розширень за місяць — більше на сторінку не варто тягнути.
  const extTotals = new Map<string, number>();
  rows.forEach(({ agg }) => {
    Object.entries(agg.filesByExt).forEach(([ext, count]) => {
      if (count > 0) extTotals.set(ext, (extTotals.get(ext) ?? 0) + count);
    });
  });
  const topExts = [...extTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ext]) => ext);

  const kpiRows: Array<{ label: string; value: (agg: DesignerMonthAgg, designerId?: string) => string }> = [
    { label: "Задач у роботі", value: (agg) => `${agg.tasksTouched}` },
    { label: "З них із таймером", value: (agg) => `${agg.timerTaskCount}` },
    {
      label: "Робіт без таймера",
      value: (_agg, designerId) => (designerId ? `${untimedFor(designerId)}` : "—"),
    },
    { label: "Робіт залито", value: (agg) => `${agg.works}` },
    { label: "Годин у таймері", value: (agg) => formatHours(agg.trackedSeconds) },
    {
      label: "⌀ час на задачу",
      value: (agg) => {
        const value = avgSecondsPerTask(agg);
        return value == null ? "—" : formatHM(value);
      },
    },
    {
      label: "Правок на задачу",
      value: (agg) => {
        const value = revisionsPerTask(agg);
        return value == null ? "—" : value.toFixed(1);
      },
    },
  ];

  return (
    <div className="print-report mx-auto w-full max-w-[190mm]">
      {header}

      <section className="mb-3">
        <h2 className="mb-1 text-[10pt] font-bold uppercase tracking-wide">Ключові показники</h2>
        <table className="text-[9pt]">
          <thead>
            <tr>
              <th className="text-left">Показник</th>
              {rows.map(({ designer }) => (
                <th key={designer.id} className="text-center">
                  {designer.label}
                </th>
              ))}
              {team ? <th className="text-center">Команда</th> : null}
            </tr>
          </thead>
          <tbody>
            {kpiRows.map((kpi) => (
              <tr key={kpi.label}>
                <td className="text-left">{kpi.label}</td>
                {rows.map(({ designer, agg }) => (
                  <td key={designer.id} className="text-center tabular-nums">
                    {kpi.value(agg, designer.id)}
                  </td>
                ))}
                {team ? <td className="print-report__muted text-center tabular-nums">{kpi.value(team)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-3">
        <h2 className="mb-1 text-[10pt] font-bold uppercase tracking-wide">Середній час на задачу за типами</h2>
        <table className="text-[9pt]">
          <thead>
            <tr>
              <th className="text-left">Тип задачі</th>
              <th className="text-center">Норма</th>
              {rows.map(({ designer }) => (
                <th key={designer.id} className="text-center" colSpan={2}>
                  {designer.label}
                </th>
              ))}
            </tr>
            <tr>
              <th className="text-left text-[8pt] font-normal">&nbsp;</th>
              <th className="text-center text-[8pt] font-normal">на задачу</th>
              {rows.map(({ designer }) => (
                <Fragment key={designer.id}>
                  <th className="text-center text-[8pt] font-normal">⌀ час</th>
                  <th className="text-center text-[8pt] font-normal">задач</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {DESIGN_TASK_TYPE_OPTIONS.map((option) => {
              const norm = DESIGN_TASK_TYPE_NORM_MINUTES[option.value];
              return (
                <tr key={option.value}>
                  <td className="text-left">{option.label}</td>
                  <td className="text-center tabular-nums">{norm == null ? "—" : `до ${norm} хв`}</td>
                  {rows.map(({ designer, agg }) => {
                    const avg = avgSecondsForType(agg, option.value);
                    const count = agg.timerTaskCountByType[option.value] ?? 0;
                    const over = avg != null && norm != null && avg > norm * 60;
                    return (
                      <Fragment key={designer.id}>
                        <td className={`text-center tabular-nums${over ? " font-bold" : ""}`}>
                          {avg == null ? "—" : formatHumanSeconds(avg)}
                          {/* Позначка, а не колір: звіт має читатись у ЧБ. */}
                          {over ? " ▲" : ""}
                        </td>
                        <td className="print-report__muted text-center tabular-nums">{count || "—"}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="print-report__meta mt-1 text-[7.5pt]">
          ▲ — перевищення норми. Норма діє для візуалізації та адаптації макету.
        </p>
      </section>

      {topExts.length > 0 ? (
        <section className="mb-3">
          <h2 className="mb-1 text-[10pt] font-bold uppercase tracking-wide">Файли за форматами</h2>
          <table className="text-[9pt]">
            <thead>
              <tr>
                <th className="text-left">Дизайнер</th>
                {topExts.map((ext) => (
                  <th key={ext} className="text-center uppercase">
                    {ext}
                  </th>
                ))}
                <th className="text-center">Візуал</th>
                <th className="text-center">Макет</th>
                <th className="text-center">Усього</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ designer, agg }) => (
                <tr key={designer.id}>
                  <td className="text-left">{designer.label}</td>
                  {topExts.map((ext) => (
                    <td key={ext} className="text-center tabular-nums">
                      {agg.filesByExt[ext] || "—"}
                    </td>
                  ))}
                  <td className="text-center tabular-nums">{agg.filesByKind.visualization || "—"}</td>
                  <td className="text-center tabular-nums">{agg.filesByKind.layout || "—"}</td>
                  <td className="text-center font-semibold tabular-nums">{agg.files}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <footer className="print-report__footnote pt-1.5 text-[7.5pt] leading-snug">
        Час і середні рахуються за таймером задач (сесія довша за 8 год обрізається як забутий таймер). «Задач у
        роботі» = задачі з таймером або залитим результатом. Задачі без таймера в середній час не входять — їхня
        кількість у рядку окремо. Файли — всі завантаження за місяць, включно з видаленими згодом.
      </footer>
    </div>
  );
}
