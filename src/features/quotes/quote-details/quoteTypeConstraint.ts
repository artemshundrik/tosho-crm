/**
 * Який вид прорахунку дозволяють його позиції.
 *
 * Межа, що щось означає, одна — поліграфія чи ні: від неї залежать тип угоди
 * зі шкалою ціни (REQ-182) і те, як показано позиції. «Товар» та «Інше» в
 * каталозі змішані (агро, іграшки, наліпки сидять в «Іншому» за дефолтом
 * створення категорії), тож між ними перемикання лишається вільним.
 *
 * Позиції без типу каталогу (вписані руками) нічого не обмежують: звіряти
 * нема з чим.
 */

export type QuoteTypeLock = {
  /** Види, на які можна перемкнути. Порожнього не буває: поточний лишається завжди. */
  allowed: ReadonlySet<string>;
  /** Чому решту закрито — для підказки біля сірого пункту. */
  reason: string | null;
};

const ALL_TYPES = ["merch", "print", "other"] as const;

export function quoteTypeLock(
  current: string | null | undefined,
  itemTypeIds: ReadonlyArray<string | null | undefined>,
  catalogTypes: ReadonlyArray<{ id: string; quote_type?: string | null }>
): QuoteTypeLock {
  const quoteTypeById = new Map(catalogTypes.map((type) => [type.id, type.quote_type ?? null]));
  let hasPrint = false;
  let hasNonPrint = false;
  for (const id of itemTypeIds) {
    if (!id) continue;
    const kind = quoteTypeById.get(id);
    if (!kind) continue;
    if (kind === "print") hasPrint = true;
    else hasNonPrint = true;
  }

  const allowed = new Set<string>();
  let reason: string | null = null;
  if (hasPrint && hasNonPrint) {
    reason = "У прорахунку і поліграфія, і товари — вид не перемкнути";
  } else if (hasPrint) {
    allowed.add("print");
    reason = "Позиції — поліграфія";
  } else if (hasNonPrint) {
    allowed.add("merch");
    allowed.add("other");
    reason = "Позиції — товари, поліграфією не позначити";
  } else {
    ALL_TYPES.forEach((type) => allowed.add(type));
  }
  if (current) allowed.add(current);
  return { allowed, reason };
}

export type QuoteTypeCatalog = ReadonlyArray<{
  id: string;
  quote_type?: string | null;
  kinds: ReadonlyArray<{ id: string; models: ReadonlyArray<{ id: string }> }>;
}>;

export type QuoteTypeItem = { catalogTypeId?: string; catalogKindId?: string; catalogModelId?: string };

/** Тип каталогу кожної позиції: прямо, а як немає — через вид чи модель. */
export function quoteItemCatalogTypeIds(
  items: ReadonlyArray<QuoteTypeItem>,
  catalogTypes: QuoteTypeCatalog
): Array<string | undefined> {
  const typeByKind = new Map<string, string>();
  const typeByModel = new Map<string, string>();
  for (const type of catalogTypes) {
    for (const kind of type.kinds) {
      typeByKind.set(kind.id, type.id);
      for (const model of kind.models) typeByModel.set(model.id, type.id);
    }
  }
  return items.map(
    (item) =>
      (item.catalogModelId ? typeByModel.get(item.catalogModelId) : undefined) ??
      (item.catalogKindId ? typeByKind.get(item.catalogKindId) : undefined) ??
      item.catalogTypeId
  );
}
