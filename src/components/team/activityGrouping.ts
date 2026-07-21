// Groups a person's activity_log rows by the ENTITY they touched (a specific
// design task / quote / order), instead of by action type.
//
// Rationale: a flat "Статус дизайну · 96" bucket produces a wall of identical
// "Статус: В роботі → Дизайн готовий" lines with no context. Grouping by entity
// answers the question a reader actually has — "what did this person do, and on
// which task?" — and lets each task expand into its own chronology.
//
// Pure functions only (no React, no network) so they are unit-testable.

import { categorizeAction, entityLabel, isNoiseActivity } from "@/components/team/activityCategories";

export type ActivityRow = {
  action?: string | null;
  title?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  href?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Display info resolved for an entity by a second lookup pass. */
export type EntityInfo = {
  number?: string | null; // e.g. "TS-0726-0049"
  name?: string | null; // task / quote title
  /** Canonical design-task type (see src/lib/designTaskType.ts), for its icon. */
  taskType?: string | null;
};

export type EntityGroup = {
  key: string;
  entityType: string | null;
  entityTypeLabel: string | null;
  number: string | null;
  name: string | null;
  taskType: string | null;
  href: string | null;
  categoryKey: string;
  events: ActivityRow[];
  lastAt: string;
};

export const UNGROUPED_KEY = "__ungrouped__";

/** ISO-8601 strings compare correctly as plain strings; newest first. */
function newestFirst(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

export function buildEntityGroups(
  rows: ActivityRow[],
  entityInfoById: Record<string, EntityInfo> = {}
): EntityGroup[] {
  const meaningful = rows.filter((row) => !isNoiseActivity(row.action ?? null, row.title ?? null));

  const buckets = new Map<string, ActivityRow[]>();
  for (const row of meaningful) {
    const key = (row.entity_id ?? "").trim() || UNGROUPED_KEY;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  const groups: EntityGroup[] = [];
  for (const [key, events] of buckets) {
    const sorted = [...events].sort((a, b) => newestFirst(a.created_at ?? "", b.created_at ?? ""));
    const info = entityInfoById[key] ?? {};
    const primary = sorted[0];
    // The design-task "header" row (action === "design_task") carries the task
    // name in `title` and has no href of its own.
    const headerRow = sorted.find((row) => (row.action ?? "").trim().toLowerCase() === "design_task");
    const href = sorted.find((row) => !!(row.href ?? "").trim())?.href ?? null;
    const entityType = primary?.entity_type ?? null;

    groups.push({
      key,
      entityType,
      entityTypeLabel: key === UNGROUPED_KEY ? null : entityLabel(entityType),
      number: info.number?.trim() || null,
      name: info.name?.trim() || headerRow?.title?.trim() || null,
      taskType: info.taskType?.trim() || null,
      href,
      categoryKey: categorizeAction(primary?.action ?? null, primary?.title ?? null, entityType),
      events: sorted,
      lastAt: sorted[0]?.created_at ?? "",
    });
  }

  groups.sort((a, b) => {
    // "Інші дії" always sinks to the bottom.
    if (a.key === UNGROUPED_KEY) return 1;
    if (b.key === UNGROUPED_KEY) return -1;
    return newestFirst(a.lastAt, b.lastAt);
  });

  return groups;
}

/** e.g. "Дизайн-задача TS-0726-0049 · Візуал шоперів Кератерм" */
export function formatGroupHeading(group: EntityGroup): string {
  if (group.key === UNGROUPED_KEY) return "Інші дії";
  const head = [group.entityTypeLabel, group.number].filter(Boolean).join(" ");
  if (head && group.name) return `${head} · ${group.name}`;
  return group.name || head || "Без назви";
}

/**
 * Design-task events and the design-task "header" row are indexed differently:
 * an event's entity_id is the task's own uuid, while the header row is keyed by
 * metadata.quote_id. Joining on entity_id alone never matched, which is why
 * tasks rendered without a name. This returns that linkage.
 */
export function collectDesignTaskLinks(rows: ActivityRow[]): { taskId: string; quoteId: string }[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const type = (row.entity_type ?? "").trim().toLowerCase();
    if (!type.startsWith("design_task")) continue;
    const taskId = (row.entity_id ?? "").trim();
    const quoteId = typeof row.metadata?.quote_id === "string" ? row.metadata.quote_id.trim() : "";
    if (!taskId || !quoteId || seen.has(taskId)) continue;
    seen.set(taskId, quoteId);
  }
  return Array.from(seen, ([taskId, quoteId]) => ({ taskId, quoteId }));
}

/** Entity ids that still need a name/number lookup, split by entity kind. */
export function collectEntityIds(rows: ActivityRow[]): {
  designTaskIds: string[];
  quoteIds: string[];
} {
  const designTaskIds = new Set<string>();
  const quoteIds = new Set<string>();
  for (const row of rows) {
    const id = (row.entity_id ?? "").trim();
    if (!id) continue;
    const type = (row.entity_type ?? "").trim().toLowerCase();
    if (type.startsWith("design_task")) designTaskIds.add(id);
    else if (type.startsWith("quote")) quoteIds.add(id);
  }
  return { designTaskIds: Array.from(designTaskIds), quoteIds: Array.from(quoteIds) };
}
