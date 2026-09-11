/**
 * Підпис місця товару в каталозі — «Худі · Одяг».
 *
 * Рівні каталогу в поліграфії часто однакові («Щоденники · Щоденники»,
 * «Сертифікати · Сертифікати»): тип заводили під один вид, і повтор у рядку
 * читається як помилка, а не як структура. Тому однакові назви кажемо ОДИН раз
 * — рядок від цього не втрачає нічого, крім подвоєння.
 */
export const catalogPlace = (kindName: string, typeName: string): string =>
  kindName.trim().toLowerCase() === typeName.trim().toLowerCase() ? kindName : `${kindName} · ${typeName}`;

/** Той самий підпис через «/», як його показує картка прорахунку. */
export const catalogPlaceSlash = (typeLabel?: string | null, kindLabel?: string | null): string => {
  const type = typeLabel?.trim() ?? "";
  const kind = kindLabel?.trim() ?? "";
  if (!type) return kind;
  if (!kind || kind.toLowerCase() === type.toLowerCase()) return type;
  return `${type} / ${kind}`;
};
