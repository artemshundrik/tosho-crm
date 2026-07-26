import { Fragment } from "react";
import { DESIGN_TASK_TYPE_NORM_MINUTES, DESIGN_TASK_TYPE_OPTIONS } from "@/lib/designTaskType";
import {
  avgSecondsForType,
  avgSecondsPerTask,
  estimateHitPercent,
  revisionsPerTask,
  type DesignerAnalytics,
  type DesignerMonthAgg,
} from "@/lib/designerAnalytics";
import { formatHM, formatHours, formatHumanSeconds, monthTitle } from "@/lib/designerAnalyticsFormat";

/**
 * Друкований звіт «порівняння дизайнерів за місяць» — рівно ОДНА сторінка A4.
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

type Props = {
  analytics: DesignerAnalytics;
  monthIndex: number;
  designers: Array<{ id: string; label: string }>;
};

export function DesignersPrintReport({ analytics, monthIndex, designers }: Props) {
  const month = analytics.months[monthIndex];
  if (!month) return null;

  const rows = designers
    .map((designer) => ({ designer, agg: analytics.perDesigner.get(designer.id)?.[monthIndex] ?? null }))
    .filter((entry): entry is { designer: Props["designers"][number]; agg: DesignerMonthAgg } => !!entry.agg);
  const team = analytics.team[monthIndex] ?? null;

  const printedAt = new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });

  // Топ-6 розширень за місяць — більше на сторінку не варто тягнути.
  const extTotals = new Map<string, number>();
  rows.forEach(({ agg }) => {
    Object.entries(agg.filesByExt).forEach(([ext, count]) => {
      if (count > 0) extTotals.set(ext, (extTotals.get(ext) ?? 0) + count);
    });
  });
  const topExts = [...extTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ext]) => ext);

  const kpiRows: Array<{ label: string; value: (agg: DesignerMonthAgg) => string }> = [
    { label: "Задач у роботі (таймер)", value: (agg) => `${agg.timerTaskCount}` },
    { label: "Задач закрито", value: (agg) => `${agg.tasksClosed}` },
    { label: "Файлів залито", value: (agg) => `${agg.files}` },
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
    {
      label: "У межах естімейту",
      value: (agg) => {
        const value = estimateHitPercent(agg);
        return value == null ? "—" : `${value}%`;
      },
    },
  ];

  return (
    <div className="print-report mx-auto w-full max-w-[190mm]">
      <header className="print-report__rule mb-3 flex items-baseline justify-between pb-1.5">
        <div>
          <h1 className="text-[15pt] font-bold leading-tight">Статистика дизайнерів</h1>
          <p className="print-report__sub text-[9pt]">{monthTitle(month.value)} · порівняння за місяць</p>
        </div>
        <p className="print-report__meta text-[8pt]">ToSho CRM · надруковано {printedAt}</p>
      </header>

      {rows.length === 0 ? (
        <p className="text-[10pt]">За цей місяць немає даних.</p>
      ) : (
        <>
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
                        {kpi.value(agg)}
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
            Час і середні рахуються за таймером задач (сесія довша за 8 год обрізається як забутий таймер).
            «Закрито» = переведення задачі в статус «Затверджено». Файли — всі завантаження за місяць, включно з
            видаленими згодом. Задачі без таймера в середні не входять.
          </footer>
        </>
      )}
    </div>
  );
}
