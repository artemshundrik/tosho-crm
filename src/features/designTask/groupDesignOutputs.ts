/**
 * Групування «Результату» дизайн-задачі: спершу групи, які завели люди, потім
 * «Без групи». Винесено зі сторінки задачі, коли треба було додати поділ за
 * автором (REQ-365).
 *
 * ПОДІЛ ЗА АВТОРОМ. У задачі з кількома дизайнерами кожен робить свою версію, і
 * файли без групи злипались в одну купу — не видно, де чия листівка. Тепер
 * «Без групи» ділиться на «Версія · Еліна Л.», «Версія · Ліна Н.». Групи, які
 * завели руками, не чіпаємо: людина вже вирішила, як їх складати.
 *
 * Поділ лише показу: `key` у всіх частинах той самий `__ungrouped__`, тож дії
 * над групою («Перемістити сюди», вибір) працюють як і раніше. Для React-ключа
 * є окремий `renderKey`.
 */

export const UNGROUPED_KEY = "__ungrouped__";

export type DesignOutputKindKey = "visualization" | "layout";

type OutputBase = { group_label?: string | null; output_kind?: DesignOutputKindKey | null };

export type DesignOutputGroup<F, L> = {
  key: string;
  renderKey: string;
  label: string;
  files: F[];
  links: L[];
};

export function groupDesignOutputsByKind<
  F extends OutputBase & { uploaded_by: string | null },
  L extends OutputBase & { created_by: string | null },
>(input: {
  files: F[];
  links: L[];
  /** Порядок груп, як їх завели люди. */
  groupOrder: string[];
  normalizeLabel: (value?: string | null) => string | null;
  /** Передано — «Без групи» ділиться за автором; null — задача з одним дизайнером. */
  authorLabel: ((userId: string) => string) | null;
}): Record<DesignOutputKindKey, DesignOutputGroup<F, L>[]> {
  const map = new Map<string, DesignOutputGroup<F, L>>();
  for (const label of input.groupOrder) {
    const normalized = input.normalizeLabel(label);
    if (normalized) map.set(normalized, { key: normalized, renderKey: normalized, label: normalized, files: [], links: [] });
  }
  const bucket = (groupLabel: string | null | undefined) => {
    const key = input.normalizeLabel(groupLabel) ?? UNGROUPED_KEY;
    const group = map.get(key) ?? {
      key,
      renderKey: key,
      label: key === UNGROUPED_KEY ? "Без групи" : key,
      files: [],
      links: [],
    };
    map.set(key, group);
    return group;
  };
  for (const file of input.files) bucket(file.group_label).files.push(file);
  for (const link of input.links) bucket(link.group_label).links.push(link);

  const indexOf = (label: string) => input.groupOrder.findIndex((entry) => entry === label);
  const groups = Array.from(map.values())
    .filter((group) => group.files.length > 0 || group.links.length > 0)
    .sort((a, b) => {
      if (a.key === UNGROUPED_KEY) return 1;
      if (b.key === UNGROUPED_KEY) return -1;
      const aIndex = indexOf(a.label);
      const bIndex = indexOf(b.label);
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
      if (aIndex >= 0) return -1;
      if (bIndex >= 0) return 1;
      return a.label.localeCompare(b.label, "uk");
    });

  const byKind = {} as Record<DesignOutputKindKey, DesignOutputGroup<F, L>[]>;
  for (const kind of ["visualization", "layout"] as DesignOutputKindKey[]) {
    byKind[kind] = groups
      .flatMap((group) => {
        const files = group.files.filter((file) => file.output_kind === kind);
        const links = group.links.filter((link) => link.output_kind === kind);
        if (group.key !== UNGROUPED_KEY || !input.authorLabel) return [{ ...group, files, links }];
        return splitByAuthor(files, links, input.authorLabel);
      })
      .filter((group) => group.files.length > 0 || group.links.length > 0);
  }
  return byKind;
}

function splitByAuthor<F extends { uploaded_by: string | null }, L extends { created_by: string | null }>(
  files: F[],
  links: L[],
  authorLabel: (userId: string) => string
): DesignOutputGroup<F, L>[] {
  const byAuthor = new Map<string, DesignOutputGroup<F, L>>();
  const take = (authorId: string | null) => {
    const id = authorId ?? "";
    const existing = byAuthor.get(id);
    if (existing) return existing;
    const group: DesignOutputGroup<F, L> = {
      key: UNGROUPED_KEY,
      renderKey: `${UNGROUPED_KEY}:${id}`,
      label: id ? `Версія · ${authorLabel(id)}` : "Без групи",
      files: [],
      links: [],
    };
    byAuthor.set(id, group);
    return group;
  };
  for (const file of files) take(file.uploaded_by).files.push(file);
  for (const link of links) take(link.created_by).links.push(link);
  return Array.from(byAuthor.values());
}
