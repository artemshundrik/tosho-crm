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

## src/pages/QuoteDetailsPage.tsx (~9 900 lines, 473 KB, as of 2026-08-27)

Зміщення звірені grep-ом 25.08.2026 (двічі за день: удруге — після редизайну
шапки й вкладок, який зсунув усе нижче 2300 приблизно на +200 рядків).
Попередня версія таблиці розійшлася з файлом на півтори тисячі рядків —
обробники статусу шукались біля 3600, а лежали біля 4200. Якщо цифра нижче не
сходиться, звіряй grep-ом і онови тут: мапа, якій не вірять, гірша за її
відсутність.

| Range | Content |
|---|---|
| 1–216 | imports |
| 217–856 | types + module-level helpers (`sanitizeQuoteSummaryForCache`, `readQuoteDetailsCache`, `resizeTextareaToContent`, `formatBriefSelection`, `toggleWrappedFormatting`, `renderBriefRichText`) |
| **857** | `export function QuoteDetailsPage(...)` — main component starts |
| **1340** | `quoteRequirements` — ЄДИНИЙ гейт збереження: тиражі, автозбереження, ТЗ, зміна статусу. Тут же поріг економіки (`validateRunEconomics`) |
| 1474 / 1478 | `toggleApprovedRun` (позначка «Погодив клієнт»), `saveRuns` |
| 1625 / 1776 | `handleDeleteQuote`, `getSelectedRunForItem` (типово віддає погоджений тираж) |
| **2302** | `statusBlockReason` — чому перехід статусу неможливий, людською мовою (права → чужий лок → незаповнені поля). Друкується в меню статусу замість сірої кнопки |
| 2466 / 2513 | `handlePrimaryStatusAction`, `handleCreateOrder` |
| 4037 | deadline handlers: `handleSaveDeadline`, `handleSaveSecondaryDeadline` |
| 4239 / 4333 | status change: `handleQuickStatusChange`, `handleConfirmCancel` |
| 4346 / 4462 | `handleDuplicateQuote`, `handleEditQuoteSubmit` |
| 4674 | catalog cascade: `handleTypeChange`, `handleKindChange`, `handleModelChange` |
| 4789 / 5030 | items: `handleSaveItem`, `handleAddComment` |
| ~5310–5360 | `quotePageTabs` — перелік вкладок; «Економіка» остання, з `soon: true` |
| ~5430–5560 | шапка: статус-контрол (DropdownMenu) + меню «⋮» |
| ~5600–5640 | вкладки (підкреслення, `after:` псевдоелемент) |
| ~5685–5745 | банери: `EntityLockBanner`, помилка статусу, «чого бракує» списком міток |
| ~5746 | вкладка «Товари» — початок |
| ~5753 | картка «Товари і тиражі» — заголовок |
| ~6250–6480 | ціни активного тиражу: чотири поля, «Погодив клієнт», підсумки |
| ~6612–6980 | окрема картка «Тиражі» (`className="hidden"` — мертва, не рендериться) |
| ~8380–8420 | вкладка «Економіка» — заглушка «скоро» |
| ~10039 | діалог «Створити замовлення» |

## src/pages/DesignTaskPage.tsx (~12 801 lines, 579 KB, as of 2026-08-24)

| Range | Content |
|---|---|
| 1–163 | imports |
| 164–1148 | types + Dropbox export helpers (`collectDesignTaskStorageFiles`, `buildDropboxClientFolderPath`, `buildDropboxBrandFolderPath`, `formatDropboxDate`, `buildDropboxExportFileName`, brief-format helpers) |
| **1149** | `export default function DesignTaskPage()` — main component starts |

## src/pages/QuotesPage.tsx (~8 252 lines, 357 KB, as of 2026-08-24)

| Range | Content |
|---|---|
| 1–157 | imports |
| 158–465 | types + cache helpers (`readQuotesPageCache`, `readQuotesPageFiltersState`, `readQuotesPageMembersCache`) |
| **466** | `export function QuotesPage(...)` — main component starts |

## src/pages/DesignPage.tsx (~5 902 lines, 252 KB, as of 2026-08-24)

| Range | Content |
|---|---|
| 1–95 | imports |
| 96–881 | types + module-level helpers (cache I/O, `sanitizeDesignTaskMetadataForCache`, `sanitizeDesignTaskForCache`, `buildDesignPageCachePayload`, `resolveTaskCustomerLogo`, `applyCustomerLogosToTasks`) |
| **882** | `export default function DesignPage()` — main component starts |
| ~4268 | `duplicateStandaloneTask(source, options)` — builds the new task's metadata when copying a design task |
| ~6989 | `<DuplicateDesignTaskDialog>` mount + `source`/`onConfirm` wiring |

---

## Design task type — quick reference

Single source of truth: **`src/lib/designTaskType.ts`** — exports `DESIGN_TASK_TYPE_OPTIONS` (the 6 values + UA labels: `visualization` Візуалізація, `presentation` Презентація, `layout_adaptation` Адаптація макету, `visualization_layout_adaptation` Візуал + адаптація макету, `layout` Верстка, `creative` Креатив), plus `DESIGN_TASK_TYPE_LABELS`, `DESIGN_TASK_TYPE_ICONS`, `parseDesignTaskType`.

- **Stored** in `activity_log.metadata->>design_task_type` (JSONB); parsed on read with `parseDesignTaskType`. Surfaced on the in-memory task as `task.designTaskType`.
- **Edited inline** on the task header via a Popover dropdown over `DESIGN_TASK_TYPE_OPTIONS` — `src/pages/DesignTaskPage.tsx` ~8950 (`applyTaskType`).
- **Copy/duplicate dialog**: `src/components/design/DuplicateDesignTaskDialog.tsx`. The "Тип задачі" row is an editable Popover dropdown (same options); the picked value rides on `DuplicateDesignTaskOptions.taskType` and is consumed by `duplicateStandaloneTask` in `DesignPage.tsx` (`options.taskType ?? source.designTaskType ?? parse(meta)`).

## Other large files (>100 KB) — no map yet

- `src/pages/TeamMembersPage.tsx` (181 KB)
- `src/pages/OrdersCustomersPage.tsx` (178 KB)
- `src/components/quotes/QuoteBatchBuilderDialog.tsx` (134 KB)
- `src/features/tosho-ai/ToShoAiConsole.tsx` (111 KB)
- `src/components/quotes/NewQuoteDialog.tsx` (113 KB)
