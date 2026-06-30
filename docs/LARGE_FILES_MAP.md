# Large files navigation map

The biggest single-file pages in `src/pages/`. `Read` tool reads 2000 lines at a time — use the offsets below to jump directly instead of re-scanning from line 1.

> Heuristic: every file follows the same shape — top half is **types + module-level helpers**, then `export (default ) function ComponentName(...)` opens the main component, which contains all handlers, effects, and the JSX `return`.

Re-generate this map if line numbers drift:
```bash
grep -nE '^export (default function|function) [A-Z]' src/pages/<file>.tsx
grep -nE '^  const handle' src/pages/<file>.tsx
```

---

## src/pages/QuoteDetailsPage.tsx (~9 560 lines, 425 KB)

| Range | Content |
|---|---|
| 1–215 | imports |
| 216–710 | types + module-level helpers (`sanitizeQuoteSummaryForCache`, `readQuoteDetailsCache`, `resizeTextareaToContent`, `formatBriefSelection`, `toggleWrappedFormatting`, `renderBriefRichText`) |
| **714** | `export function QuoteDetailsPage(...)` — main component starts |
| 648 / 1179 / 1319 / 1368 | early handlers: `handleDeleteQuote`, `handleBriefInlineBlur`, `handlePrimaryStatusAction`, `handleCreateOrder` |
| 3435–3454 | attachments drag/drop handlers |
| 3454–3627 | deadline handlers: `handleSaveDeadline`, `handleSaveSecondaryDeadline` (2-arg options object form) |
| 3628–3711 | status change: `handleQuickStatusChange`, `handleConfirmCancel` |
| 3712 / 3915 | `handleDuplicateQuote`, `handleEditQuoteSubmit` |
| 4130–4150 | catalog cascade: `handleTypeChange`, `handleKindChange`, `handleModelChange` |
| 4293 / 4464 / 4479 | items: `handleSaveItem`, `handleDeleteItem`, `handleAddComment` |
| ~3568 | start of two-column layout (`flex flex-col lg:flex-row gap-6 items-start`) |
| ~4377–4598 | Тиражі / runs card |
| ~4662–4750 | Підсумок card |

## src/pages/DesignTaskPage.tsx (~9 786 lines, 420 KB)

| Range | Content |
|---|---|
| 1–163 | imports |
| 164–1148 | types + Dropbox export helpers (`collectDesignTaskStorageFiles`, `buildDropboxClientFolderPath`, `buildDropboxBrandFolderPath`, `formatDropboxDate`, `buildDropboxExportFileName`, brief-format helpers) |
| **1149** | `export default function DesignTaskPage()` — main component starts |

## src/pages/QuotesPage.tsx (~7 990 lines, 332 KB)

| Range | Content |
|---|---|
| 1–157 | imports |
| 158–465 | types + cache helpers (`readQuotesPageCache`, `readQuotesPageFiltersState`, `readQuotesPageMembersCache`) |
| **466** | `export function QuotesPage(...)` — main component starts |

## src/pages/DesignPage.tsx (~6 348 lines, 280 KB)

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

- `src/pages/TeamMembersPage.tsx` (176 KB)
- `src/pages/OrdersCustomersPage.tsx` (153 KB)
- `src/components/quotes/QuoteBatchBuilderDialog.tsx` (134 KB)
- `src/features/tosho-ai/ToShoAiConsole.tsx` (109 KB)
- `src/components/quotes/NewQuoteDialog.tsx` (101 KB)
