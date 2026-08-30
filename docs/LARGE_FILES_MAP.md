# Large files navigation map

The biggest single-file pages in `src/pages/`. **All sizes are snapshots — every heading carries
its own "as of" date, and `npm run check:docs-drift` re-checks them against the tree.** `Read` tool reads 2000 lines at a time — use the offsets below to jump directly instead of re-scanning from line 1.

> Heuristic: every file follows the same shape — top half is **types + module-level helpers**, then `export (default ) function ComponentName(...)` opens the main component, which contains all handlers, effects, and the JSX `return`.

Re-generate this map if line numbers drift:
```bash
grep -nE '^export (default function|function) [A-Z]' src/pages/<file>.tsx
grep -nE '^  const handle' src/pages/<file>.tsx
```

---

## src/pages/QuoteDetailsPage.tsx (~8 511 lines, 405 KB, as of 2026-08-30)

Зміщення звірені grep-ом 30.08.2026 — після REQ-155 p1–p7. За цю роботу файл
СХУДНУВ на 1 340 рядків: вкладка «Дизайн» поїхала в окремий модуль, розбір
файлів-виходів дизайну — у `designOutputFiles.ts`, а мертвий після редизайну
редактор ТЗ прибрано. Тому все нижче 1 200 зсунулось УГОРУ на сотні рядків, а не
вниз, як звикле.

Якщо цифра нижче не сходиться, звіряй grep-ом і онови тут: мапа, якій не вірять,
гірша за її відсутність.

| Range | Content |
|---|---|
| 1–245 | imports |
| 246–588 | types + module-level helpers (`sanitizeQuoteSummaryForCache`, `readQuoteDetailsCache`, `renderBriefRichText`); розбір файлів дизайну переїхав у `quote-details/designOutputFiles.ts` |
| **589** | `export function QuoteDetailsPage(...)` — main component starts |
| **1106** | `quoteRequirements` — ЄДИНИЙ гейт збереження: тиражі, автозбереження, ТЗ, зміна статусу. Тут же поріг економіки (`validateRunEconomics`) |
| 1223 / 1227 | `toggleApprovedRun` (позначка «Погодив клієнт»), `saveRuns` |
| 1399 / 1450 | `handleDeleteQuote`, `getSelectedRunForItem` (типово віддає погоджений тираж) |
| **2001** | `statusBlockReason` — чому перехід статусу неможливий, людською мовою (права → чужий лок → незаповнені поля). Друкується в меню статусу замість сірої кнопки |
| 2178 / 2225 | `handlePrimaryStatusAction`, `handleCreateOrder` |
| 3554 / 3668 | deadline handlers: `handleSaveDeadline`, `handleSaveSecondaryDeadline` |
| 3756 / 3858 | status change: `handleQuickStatusChange`, `handleConfirmCancel` |
| 3871 / 3987 | `handleDuplicateQuote`, `handleEditQuoteSubmit` |
| 4199 | catalog cascade: `handleTypeChange`, `handleKindChange`, `handleModelChange` |
| 4314 / 4555 | items: `handleSaveItem`, `handleAddComment` |
| **4822** | `quotePageTabs` — перелік вкладок; «Економіка» остання, з `soon: true` |
| 4897–5053 | `<header>`: статус-контрол (DropdownMenu) + меню «⋮» (там же «Створити дизайн-задачу») |
| 5068 | смуга вкладок — спільний `<TabBar>` (`src/components/ui/tab-bar.tsx`); риска ПЕРЕЇЖДЖАЄ окремим вузлом, псевдоелемента `after:` у файлі більше немає |
| 5109 | банери: `EntityLockBanner`, помилка статусу, «чого бракує» списком міток |
| 5170 | вкладка «Товари» — `<section className="tab-panel">` |
| 5177 | картка «Товари і тиражі» — заголовок |
| 5725 | `<QuoteRunRows>` — перелік тиражів рядками на жорсткій сітці; розмітка в `src/features/quotes/quote-details/QuoteRunRows.tsx` |
| 5808 / 5826 | активний тираж: `<QuoteRunPriceFields>` (чотири поля) і `<QuoteRunMarkupPanel>` (накрутка зі шкалою + ціна з розкладом) |
| 5882–6265 | окрема картка «Тиражі» (`<details className="hidden">` — мертва, не рендериться) |
| 6267 / 6669 | вкладки «Дедлайни», «Дизайн» |
| 6697 | `<QuoteDesignTasksPanel>` — уся вкладка «Дизайн»: пігулки задач, шапка Ш1, ТЗ, візуали, вихідні матеріали. Розмітка й збирач карток (`buildQuoteDesignTaskCards`) — у `src/features/quotes/quote-details/QuoteDesignTasksPanel.tsx` |
| 6751 / 7324 | вкладки «Обговорення», «Економіка» (заглушка `EconomicsComingSoon`) |
| 8396 | діалог «Створити замовлення» |

## src/pages/DesignTaskPage.tsx (~12 865 lines, 583 KB, as of 2026-08-30)

| Range | Content |
|---|---|
| 1–222 | imports |
| 223–1325 | types + Dropbox export helpers (`collectDesignTaskStorageFiles`, `buildDropboxClientFolderPath`, `buildDropboxBrandFolderPath`, `formatDropboxDate`, `buildDropboxExportFileName`, brief-format helpers) |
| **1326** | `export default function DesignTaskPage()` — main component starts |
| 5730 | `applyTaskType` — зміна типу задачі (виклик із меню — ~9792) |

## src/pages/QuotesPage.tsx (~8 408 lines, 362 KB, as of 2026-08-30)

| Range | Content |
|---|---|
| 1–193 | imports |
| 194–550 | types + cache helpers (`readQuotesPageCache`, `readQuotesPageFiltersState`, `readQuotesPageMembersCache`) |
| **553** | `export function QuotesPage(...)` — main component starts |

## src/pages/DesignPage.tsx (~5 949 lines, 258 KB, as of 2026-08-30)

| Range | Content |
|---|---|
| 1–144 | imports |
| 145–943 | types + module-level helpers (cache I/O, `sanitizeDesignTaskMetadataForCache`, `sanitizeDesignTaskForCache`, `buildDesignPageCachePayload`, `resolveTaskCustomerLogo`, `applyCustomerLogosToTasks`) |
| **944** | `export default function DesignPage()` — main component starts |
| 3961 | `duplicateStandaloneTask(source, options)` — builds the new task's metadata when copying a design task |
| 5895 | `<DuplicateDesignTaskDialog>` mount + `source`/`onConfirm` wiring |

---

## Design task type — quick reference

Single source of truth: **`src/lib/designTaskType.ts`** — exports `DESIGN_TASK_TYPE_OPTIONS` (the 6 values + UA labels: `visualization` Візуалізація, `presentation` Презентація, `layout_adaptation` Адаптація макету, `visualization_layout_adaptation` Візуал + адаптація макету, `layout` Верстка, `creative` Креатив), plus `DESIGN_TASK_TYPE_LABELS`, `DESIGN_TASK_TYPE_ICONS`, `parseDesignTaskType`.

- **Stored** in `activity_log.metadata->>design_task_type` (JSONB); parsed on read with `parseDesignTaskType`. Surfaced on the in-memory task as `task.designTaskType`.
- **Edited inline** on the task header via a Popover dropdown over `DESIGN_TASK_TYPE_OPTIONS` — `src/pages/DesignTaskPage.tsx` 5730 (`applyTaskType`).
- **Copy/duplicate dialog**: `src/components/design/DuplicateDesignTaskDialog.tsx`. The "Тип задачі" row is an editable Popover dropdown (same options); the picked value rides on `DuplicateDesignTaskOptions.taskType` and is consumed by `duplicateStandaloneTask` in `DesignPage.tsx` (`options.taskType ?? source.designTaskType ?? parse(meta)`).

## Other large files (>100 KB) — no map yet

Розміри звірені 29.08.2026. `database.types.ts` не входить: він генерований.

- `src/pages/OrdersCustomersPage.tsx` (178 KB)
- `src/pages/OrdersProductionDetailsPage.tsx` (149 KB)
- `src/layout/AppLayout.tsx` (144 KB)
- `src/components/design/DesignersDashboard.tsx` (140 KB)
- `src/components/quotes/QuoteBatchBuilderDialog.tsx` (134 KB)
- `src/features/finances/FinanceExpenses.tsx` (119 KB)
- `src/features/orders/orderRecords.ts` (116 KB)
- `src/pages/TeamMembersPage.tsx` (115 KB)
- `src/components/quotes/NewQuoteDialog.tsx` (113 KB)
- `src/features/tosho-ai/ToShoAiConsole.tsx` (111 KB)
- `src/pages/TeamPage.tsx` (107 KB)
