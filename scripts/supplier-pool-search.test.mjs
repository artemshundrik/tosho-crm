import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * СТОРОЖА ДОСТУПУ ДЛЯ `search_supplier_pool` (16.09.2026).
 *
 * Функція стала `security definer` не від добра: RLS на `supplier_products`
 * вимикає тригрaмний покажчик (`ILIKE` не leakproof, а умови політики
 * рахуються як бар'єр безпеки першими), і кожен пошук ішов повним сканом —
 * 5 508 мс у середньому по 184 справжніх викликах на проді.
 *
 * Ціна рішення: RLS цю функцію більше НЕ страхує, бо власник — суперюзер.
 * Єдине, що відділяє чужу команду від видачі, — умова, виписана в тілі
 * руками. Поки вона була лише коментарем «не забудь», її міг прибрати
 * будь-який рефакторинг, і жодна перевірка б не пискнула: даних другої
 * команди в базі немає, тож і наскрізний тест нічого б не спіймав.
 *
 * Тому сторожа тут текстова, і це свідомо. Вона не доводить правильність
 * умови — вона не дає їй ЗНИКНУТИ. Ловиться саме той випадок, який реально
 * трапляється: хтось «спрощує» запит і виносить зайве.
 */
const sql = readFileSync(
  fileURLToPath(new URL("./supplier-pool-search.sql", import.meta.url)),
  "utf8"
);

describe("search_supplier_pool: доступ", () => {
  it("виконується правами власника — і тому мусить перевіряти доступ сама", () => {
    // Саме рядок оголошення, а не згадка в коментарі: інакше сторожа
    // «проходить» на функції, повернутій в invoker, бо про definer написано
    // в шапці файлу.
    expect(sql).toMatch(/^security definer$/m);
    // Порожній search_path — щоб викликач не підсунув свою схему під таблицю.
    expect(sql).toMatch(/^set search_path = ''$/m);
  });

  it("виписує обидві половини політики supplier_products_select", () => {
    // Своя команда: дослівно те саме, що `team_id in (select get_my_team_ids())`.
    expect(sql).toContain("public.get_my_team_ids()");
    expect(sql).toMatch(/team_id = any \(viewer\.team_ids\)/);
    // Гейт заблокованих: звільнений не має бачити нічого (REQ-257).
    expect(sql).toContain("tosho.is_user_blocked((select auth.uid()))");
    expect(sql).toMatch(/not viewer\.blocked/);
  });

  it("кличе таблицю лише через повністю кваліфіковане ім'я", () => {
    // `from supplier_products` без схеми під порожнім search_path не знайдеться
    // взагалі, але з `search_path`, забутим у майбутній правці, — знайдеться
    // чужа. Тримаємо правило текстом, поки воно дешеве.
    expect(sql).not.toMatch(/\b(from|join)\s+supplier_products\b/);
  });

  it("права на виклик лишаються тільки в авторизованих", () => {
    expect(sql).toContain(
      "revoke all on function tosho.search_supplier_pool(text[], integer) from public;"
    );
    expect(sql).toContain(
      "grant execute on function tosho.search_supplier_pool(text[], integer) to authenticated;"
    );
  });
});
