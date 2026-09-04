import { getMethodLabel, getPrintPositionLabel } from "./catalog-utils";

import type { DesignComposerImprint } from "./QuoteDesignTaskComposer";

/**
 * Нанесення позиції людськими словами — для довідки в композері дизайн-задачі
 * (REQ-246).
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ, а не десятьма рядками в картці прорахунку: файл на сім
 * із половиною тисяч рядків саме так і виріс. Тут же це чиста функція, яку
 * видно цілком і яку можна перевірити тестом.
 *
 * Тип і місце ставлять у товарі, при створенні прорахунку; розмір дизайнер
 * бере з ТЗ. Композер їх ЛИШЕ показує — щоб не відкривати вкладку «Товари»
 * заради перевірки, з чим саме заводиться задача.
 *
 * Місце буває вписаним руками (REQ-182#p24): якщо рядка довідника немає,
 * беремо підпис із самого нанесення, а не кажемо «Місце не вказано» про те,
 * що менеджер якраз вказав.
 */
export function buildComposerImprint(
  item:
    | {
        methods?: Array<{
          methodId: string;
          printPositionId?: string;
          printPositionLabel?: string | null;
          printWidthMm?: number | null;
          printHeightMm?: number | null;
        }> | null;
        resolvedMethodNames?: Record<string, string>;
        resolvedTypeId?: string;
        resolvedKindId?: string;
      }
    | null
    | undefined,
  catalogTypes: Parameters<typeof getMethodLabel>[0]
): DesignComposerImprint[] {
  if (!item?.methods?.length) return [];
  return item.methods.map((method) => {
    const size =
      method.printWidthMm && method.printHeightMm
        ? `${method.printWidthMm}×${method.printHeightMm} мм`
        : method.printWidthMm
          ? `${method.printWidthMm} мм`
          : method.printHeightMm
            ? `${method.printHeightMm} мм`
            : null;
    return {
      method:
        item.resolvedMethodNames?.[method.methodId] ??
        getMethodLabel(catalogTypes, item.resolvedTypeId, item.resolvedKindId, method.methodId) ??
        "Метод",
      place:
        getPrintPositionLabel(catalogTypes, item.resolvedTypeId, item.resolvedKindId, method.printPositionId) ??
        method.printPositionLabel?.trim() ??
        "Місце не вказано",
      size,
    };
  });
}
