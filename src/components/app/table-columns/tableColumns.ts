/**
 * Колонки таблиці, ширину яких людина тягне мишею (спільне для всіх списків,
 * починалось у прорахунках). Опис колонок — `TableColumnsSpec`: які колонки
 * тягнуться, їхня типова й мінімальна ширина, скільки займають нерухомі
 * (чекбокс, аватар, меню) і скільки лишити гнучкій колонці, що забирає залишок.
 *
 * Гнучка колонка — ОСТАННЯ (меню рядка, дедлайн), а не назва: назва теж
 * тягнеться. Поки її не тягнули, вона (`grow`) забирає все вільне місце;
 * звузили руками — залишок іде в останню колонку.
 */
export type TableColumnDef = {
  label: string;
  def: number;
  min: number;
  /** Стеля; без неї — DEFAULT_COLUMN_MAX. */
  max?: number;
};

export const DEFAULT_COLUMN_MAX = 480;

export const tableColumnMax = (column: TableColumnDef) => Math.max(column.def, column.max ?? DEFAULT_COLUMN_MAX);

export type TableColumnsSpec<Id extends string> = {
  ids: readonly Id[];
  columns: Record<Id, TableColumnDef>;
  /** Сума ширин колонок, що не тягнуться (чекбокс, меню рядка…). */
  fixedPx: number;
  /**
   * Колонка, якій дістається все вільне місце, поки людина не задала їй
   * ширину сама. Зазвичай назва: на широкому екрані вона розкривається, а не
   * обрізається поруч із порожнечею.
   */
  grow?: Id;
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
  for (const id of spec.ids) {
    const column = spec.columns[id];
    base[id] = Math.min(tableColumnMax(column), Math.max(column.min, wanted[id] ?? column.def));
  }
  const sum = spec.ids.reduce((acc, id) => acc + base[id], 0);
  const minSum = spec.ids.reduce((acc, id) => acc + spec.columns[id].min, 0);
  const target = Math.max(minSum, containerWidth - spec.fixedPx - spec.flexMinPx);
  if (containerWidth <= 0) return base;
  if (sum <= target) {
    const grow = spec.grow;
    if (grow && wanted[grow] === undefined) {
      // Без стелі: вільне місце забирає назва цілком, інакше на широкому
      // моніторі пів таблиці стоїть порожнім (Артем, 01.11.2026). Стеля
      // діє лише на ширину, яку людина тягне руками.
      base[grow] = base[grow] + (target - sum);
    }
    return base;
  }
  const slack = sum - minSum;
  const need = sum - target;
  const out = {} as TableColumnWidths<Id>;
  for (const id of spec.ids) {
    const free = base[id] - spec.columns[id].min;
    out[id] = Math.floor(base[id] - (slack > 0 ? (free * need) / slack : 0));
  }
  return out;
}
