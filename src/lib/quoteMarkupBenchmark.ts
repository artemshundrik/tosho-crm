/**
 * Відмітка-орієнтир на смузі накрутки (REQ-149, пункт p10).
 *
 * ЩО ЦЕ І ЧОГО ЦЕ НЕ Є. Це рекомендований відсоток ДЛЯ ЦІЄЇ ПОЗИЦІЇ, і тільки.
 * Ніяких імен, ніяких чужих сум, ніякого порівняння менеджерів між собою —
 * поправка СЕО 30.08.2026 сказана дослівно так. Мета — щоб підставлені 40 % не
 * читались як «стільки й треба», а не щоб когось із кимось зіставити.
 *
 * ЧОМУ НЕМАЄ ЗАПАСНОГО ВАРІАНТА «МЕДІАНА ПО КОМПАНІЇ». Він був би найпростішим
 * і найшкідливішим. Замір 30.08.2026: із 163 тиражів із порахованою націнкою
 * 157 завела одна людина, а двоє топових менеджерів прорахунків у CRM не ведуть
 * узагалі. Тобто «медіана компанії» — це особиста звичка однієї людини, і
 * ставити її орієнтиром усім означало б видати випадковість за норму.
 *
 * ТОМУ ДВА РІВНІ Й ЧЕСНЕ «ЗАМАЛО ДАНИХ». Спершу сама модель, далі вид товару,
 * і на кожному — не менше п'яти продажів. Заміряно на проді: із 94 моделей
 * п'ять і більше продажів мають 4, із 51 виду — 9. Тобто більшість позицій
 * зараз чесно скаже «замало даних», і це правильна відповідь, а не порожнеча,
 * яку треба чимось затулити.
 */

/**
 * Скільки продажів треба, щоб число вважалось орієнтиром.
 *
 * П'ять — це не «статистично достатньо», а межа, нижче за яку медіана
 * повторює один випадок. Прототип називав саме її, і замір показав, що вона
 * відсіює рівно те, що мала: позиції з двома-трьома прорахунками.
 */
export const MARKUP_BENCHMARK_MIN_SAMPLES = 5;

export type MarkupBenchmarkBasis = "model" | "kind";

export type MarkupBenchmark = {
  /** Медіанна накрутка у відсотках. */
  rate: number;
  sampleCount: number;
  basis: MarkupBenchmarkBasis;
};

export type MarkupBenchmarkSamples = {
  /** Накрутки історичних тиражів по тій самій моделі каталогу. */
  model: number[];
  /** Те саме по виду товару — ширший, слабший сигнал. */
  kind: number[];
};

function median(values: number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * `null` — це відповідь, а не збій: блок каже «замало даних» і не малює
 * відмітку. Саме про це просив СЕО — краще порожньо, ніж цифра з двох випадків.
 */
export function resolveMarkupBenchmark(samples: MarkupBenchmarkSamples): MarkupBenchmark | null {
  const model = samples.model ?? [];
  if (model.length >= MARKUP_BENCHMARK_MIN_SAMPLES) {
    return { rate: median(model), sampleCount: model.length, basis: "model" };
  }
  const kind = samples.kind ?? [];
  if (kind.length >= MARKUP_BENCHMARK_MIN_SAMPLES) {
    return { rate: median(kind), sampleCount: kind.length, basis: "kind" };
  }
  return null;
}

export function formatMarkupBenchmarkBasis(basis: MarkupBenchmarkBasis): string {
  return basis === "model" ? "по цій моделі" : "по цьому виду товару";
}
