/**
 * Колонки таблиці, ширину яких людина тягне мишею (спільне для всіх списків,
 * починалось у прорахунках). Опис колонок — `TableColumnsSpec`: які колонки
 * тягнуться, їхня типова й мінімальна ширина, скільки займають нерухомі
 * (чекбокс, аватар, меню) і скільки лишити гнучкій колонці, що забирає залишок.
 */
export type TableColumnDef = { label: string; def: number; min: number };

export type TableColumnsSpec<Id extends string> = {
  ids: readonly Id[];
  columns: Record<Id, TableColumnDef>;
  /** Сума ширин колонок, що не тягнуться (чекбокс, меню рядка…). */
  fixedPx: number;
  /** Гнучка колонка (без ширини) не вужча за це. */
  flexMinPx: number;
  /** Префікс ключів localStorage; міняй версію, коли міняєш набір колонок. */
  storageKey: string;
  /** Префікс CSS-змінних: `--{varPrefix}-{id}`. */
  varPrefix: string;
};

export function defineTableColumns<Id extends string>(spec: TableColumnsSpec<Id>) {
  return spec;
}

export type TableColumnWidths<Id extends string> = Record<Id, number>;

/** Ширина колонки в стилі: змінну пише хук, поки її немає — типова. */
export const tableColumnWidth = <Id extends string>(spec: TableColumnsSpec<Id>, id: Id) =>
  `var(--${spec.varPrefix}-${id}, ${spec.columns[id].def}px)`;

/**
 * Побажані ширини → ті, що вміщаються в контейнер. Якщо не вміщаються —
 * стискаємо пропорційно запасу над мінімумом кожної колонки, тож жодна не
 * вужча за свій мінімум, а горизонтальної прокрутки не буде (хіба що сам
 * контейнер менший за суму мінімумів).
 */
export function resolveTableColumnWidths<Id extends string>(
  spec: TableColumnsSpec<Id>,
  wanted: Partial<Record<Id, number>>,
  containerWidth: number
): TableColumnWidths<Id> {
  const base = {} as TableColumnWidths<Id>;
  for (const id of spec.ids) base[id] = Math.max(spec.columns[id].min, wanted[id] ?? spec.columns[id].def);
  const sum = spec.ids.reduce((acc, id) => acc + base[id], 0);
  const minSum = spec.ids.reduce((acc, id) => acc + spec.columns[id].min, 0);
  const target = Math.max(minSum, containerWidth - spec.fixedPx - spec.flexMinPx);
  if (containerWidth <= 0 || sum <= target) return base;
  const slack = sum - minSum;
  const need = sum - target;
  const out = {} as TableColumnWidths<Id>;
  for (const id of spec.ids) {
    const free = base[id] - spec.columns[id].min;
    out[id] = Math.floor(base[id] - (slack > 0 ? (free * need) / slack : 0));
  }
  return out;
}
