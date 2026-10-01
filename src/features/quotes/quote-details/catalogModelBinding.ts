import { findCatalogModelByKindAndName, insertCatalogModelRow, updateCatalogModelImage } from "./queries";

/**
 * Товар без моделі → справжній рядок каталогу обраного виду (REQ-182#p18).
 *
 * ДВА МІСЦЯ, ОДИН ШЛЯХ. Спершу це робило лише «Створити» у вікні нового
 * прорахунку (`bindCatalogModel`). Потім вибір виду переїхав і в картку
 * позиції (REQ-324#p1): товар за посиланням, чий вид не вгадався, лягав без
 * виду й без нанесення, і поставити вид можна було лише заміною товару. Якби
 * картка заводила модель інакше, ніж вікно, той самий товар із двох входів
 * ставав би двома моделями — тож ядро тут, а обидва місця його кличуть.
 *
 * Повертає id моделі або `null`, якщо завести не вдалося: позиція тоді лягає
 * з видом, але без моделі, і рахуватись від цього не перестає.
 */
export async function ensureCatalogModel(input: {
  teamId: string;
  kindId: string;
  name: string;
  imageUrl: string | null;
  supplierUrl: string | null;
  avantprintUrl: string | null;
  sku: string | null;
}): Promise<string | null> {
  const name = input.name.trim().slice(0, 160);
  if (!name) return null;
  const sku = input.sku?.trim() || null;

  // ТОЙ САМИЙ ТОВАР УДРУГЕ — це та сама модель, а не друга з тією ж назвою.
  // На `catalog_models` стоїть унікальний індекс (kind_id, name), тож повторна
  // вставка просто падала, а прив'язка мовчки віддавала позицію БЕЗ моделі —
  // і в картці зникали фото з назвою товару, хоч посилання й артикул
  // лишались. Симптом читався як «фото не працює», а причина була в тому, що
  // цю кепку вже додавали годину тому.
  const existing = await findCatalogModelByKindAndName(input.kindId, name);
  if (existing) {
    // Фото добираємо ЛИШЕ В ПОРОЖНЄ — тим самим правилом, що й фонова
    // розвідка: знімок, який хтось поставив руками, головніший за фід.
    if (!existing.image_url && input.imageUrl) {
      await updateCatalogModelImage(existing.id, input.imageUrl);
    }
    return existing.id;
  }

  const inserted = await insertCatalogModelRow({
    team_id: input.teamId,
    kind_id: input.kindId,
    name,
    // ФОТО, ЯКЩО ВОНО ВЖЕ Є. Для голого посилання його ще немає — доставить
    // фонова розвідка. Але товар із пулу приходить із готовою адресою знімка,
    // і викидати її означало показувати сірий квадрат замість того, що
    // менеджер щойно бачив у підказці (Артем, 08.09.2026).
    image_url: input.imageUrl,
    metadata: {
      source: { vendor: "link", url: input.supplierUrl, importedAt: new Date().toISOString() },
      ...(input.supplierUrl ? { supplierUrl: input.supplierUrl } : {}),
      // Друга кнопка картки. Модель живе довше за прорахунок, тож посилання
      // лягає і сюди — інакше наступний прорахунок із цією ж моделлю знову
      // почався б із сірої кнопки.
      ...(input.avantprintUrl ? { avantprintUrl: input.avantprintUrl } : {}),
      // Артикул у КАТАЛОЗІ, а не лише в позиції (REQ-247): каталог живе довше
      // за прорахунок, і пошук моделі по SKU на сторінці каталогу читає саме
      // `metadata.sku`. Без цього товар, доданий посиланням, лишався б у
      // каталозі безіменним кодом.
      ...(sku ? { sku } : {}),
    },
  });
  if (inserted.ok) return inserted.data.id;

  // Гонка: між пошуком і вставкою модель завів хтось інший (або сусідня
  // позиція цього ж заїзду). Питаємо ще раз, перш ніж лишати позицію без
  // моделі — мовчазна втрата фото коштувала дорожче за зайвий запит.
  const raced = await findCatalogModelByKindAndName(input.kindId, name);
  return raced?.id ?? null;
}
