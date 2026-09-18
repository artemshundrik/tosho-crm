import * as React from "react";

import { supabase } from "@/lib/supabaseClient";

/**
 * Чим і куди наносять на цьому виді товару — методи й місця (REQ-182#p16, p24).
 *
 * ЧОМУ ЗА ВИДОМ. `catalog_methods.kind_id` не буває порожнім: метод — це
 * «доступний цьому виду», і всі 244 моделі каталогу мають ті самі методи,
 * що їхній вид. Місця (`catalog_print_positions`) прив'язані так само. Тому
 * позиція без виду (посилання, назва руками) чипів не має: `method_id`
 * мусить указувати на рядок виду, інакше жоден читач — картка, замовлення,
 * дизайн-задача — не зможе назвати метод.
 *
 * ЧОМУ ЗА ІСТОРІЄЮ. Худі має 7 методів, кепка 8, а менеджер майже завжди
 * бере той, що й минулого разу: Горнятко → Деколь 17 / Гравіювання 8 / УФ 7,
 * Кепка → ДТФ 11 / Вишивка 10 (заміри 04.09.2026). Перший чип — найчастіший,
 * тож у більшості випадків це один клік, а не пошук у списку за абеткою.
 *
 * МІСЦЬ МАЙЖЕ НЕМАЄ, І ЦЕ НОРМА. Довідник місць заповнений у трьох видів із
 * 92 — Футболка й два види пакетів, — тож для решти список приходить
 * порожнім, і місце вписують руками. Через це, до речі, «Індивідуальний» із
 * футболки стояв на горнятках, кепках і ручках 203 рази: іншого списку
 * менеджеру ніхто не давав. Вписане на «Створити» стає рядком довідника
 * цього виду, тож список наповнюється сам.
 *
 * ЛІНИВО Й ПО ОДНОМУ ВИДУ. Вид з'являється, коли в список стає позиція з
 * каталогу; тоді й ходимо: три запити на вид, відповідь лишається в кеші
 * на час життя вікна. Невдача мовчазна — без чипів позиція лягає «без
 * нанесення», і методи додаються вже в картці, як і досі.
 *
 * СПИСОК ВИДУ — НЕ СТІНА (REQ-292). Мультитул мав один метод, і коли
 * замовник хотів на чохлі ДТФ, менеджер ішов просити Артема дописати його
 * у вид. «Інші методи…» показує решту СПІЛЬНОГО довідника; обраний метод
 * прив'язується до виду тим самим рядком `catalog_methods`, що пише Каталог,
 * і наступного разу стоїть уже в списку виду. Нових НАЗВ тут не заводять
 * свідомо: дублі «DTF-друк» / «ДТФ друк» уже двічі вичищали руками, тож
 * назву додають лише в Каталозі, де поруч видно весь довідник.
 *
 * ДОВІДНИК — ЩЕ ЛІНИВІШЕ: один запит на все вікно, і лише тоді, коли
 * людина розгорнула «Інші методи…». Першому рендеру він не коштує нічого.
 */

export type KindMethodOption = { id: string; name: string };
export type KindPlaceOption = { id: string; label: string };
export type KindImprintOptions = { methods: KindMethodOption[]; places: KindPlaceOption[] };

/** Метод зі спільного довідника компанії (`tosho.method_directory`). */
export type DirectoryMethodOption = { id: string; name: string };

/**
 * «Інші методи…» для одного виду: довідник компанії і прив'язка обраного
 * методу до виду. Смуга нанесення отримує це готовим і про базу не знає.
 */
export type MethodDirectorySource = {
  /** Активні методи довідника за абеткою; `null` — ще не завантажено. */
  entries: DirectoryMethodOption[] | null;
  /** Останнє завантаження не вдалося — можна спробувати ще раз. */
  failed: boolean;
  /** Завантажити довідник, якщо його ще немає. Повторний виклик нічого не робить. */
  request: () => void;
  /** Прив'язати метод до виду. Повертає рядок виду або кидає причину невдачі. */
  attach: (entry: DirectoryMethodOption) => Promise<KindMethodOption>;
};

/** Порушення унікальності в Postgres. */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";

/** Активні методи довідника компанії, за абеткою. */
export async function loadMethodDirectory(teamId: string): Promise<DirectoryMethodOption[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("method_directory")
    .select("id,name")
    .eq("team_id", teamId)
    .eq("active", true);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => Boolean(row.id && row.name?.trim()))
    .map((row) => ({ id: row.id, name: row.name }))
    .sort((left, right) => left.name.localeCompare(right.name, "uk"));
}

/**
 * Прив'язує метод довідника до виду й повертає рядок `catalog_methods`.
 *
 * ФОРМА ЗАПИСУ — ТА САМА, ЩО В КАТАЛОЗІ (`useModelEditor`, handleAddMethod):
 * `directory_id` указано, тож тригер `catalog_methods_bind_directory` лише
 * підставить канонічну назву довідника, а нового рядка довідника не заведе.
 *
 * ХТОСЬ ВСТИГ ПЕРШИМ (23505) — це не помилка, а відповідь: метод уже є у
 * виду, беремо його рядок. Шукаємо спершу за довідником — саме на ньому
 * тримається унікальність виду, і перейменування в довіднику, що сталося,
 * поки вікно було відкрите, її не зачіпає, — а потім за назвою, на випадок
 * давнього рядка, чиє дзеркало назви розійшлося з довідником.
 */
export async function attachDirectoryMethod(
  teamId: string,
  kindId: string,
  entry: DirectoryMethodOption
): Promise<KindMethodOption> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("catalog_methods")
    .insert({ team_id: teamId, kind_id: kindId, name: entry.name, price: null, directory_id: entry.id })
    .select("id,name")
    .single();
  if (!error && data) return { id: data.id, name: data.name };
  if (!isUniqueViolation(error)) throw error ?? new Error("База не повернула доданий метод");

  const lookups: Array<["directory_id" | "name", string]> = [
    ["directory_id", entry.id],
    ["name", entry.name],
  ];
  for (const [column, value] of lookups) {
    const { data: existing, error: lookupError } = await supabase
      .schema("tosho")
      .from("catalog_methods")
      .select("id,name")
      .eq("team_id", teamId)
      .eq("kind_id", kindId)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return { id: existing.id, name: existing.name };
  }
  throw error;
}

/** Скільки останніх позицій виду беремо в історію: далі ваги вже не міняються. */
const HISTORY_ROWS = 300;

async function loadKindOptions(teamId: string, kindId: string): Promise<KindImprintOptions> {
  const [{ data: methodRows, error: methodError }, { data: placeRows }, { data: historyRows }] = await Promise.all([
    supabase.schema("tosho").from("catalog_methods").select("id,name").eq("team_id", teamId).eq("kind_id", kindId),
    // Без .eq("team_id"): у catalog_print_positions такої колонки немає —
    // команду тут стереже RLS через вид (queries.ts, fetchCatalogEnrichment).
    supabase
      .schema("tosho")
      .from("catalog_print_positions")
      .select("id,label,sort_order")
      .eq("kind_id", kindId)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    supabase
      .schema("tosho")
      .from("quote_items")
      .select("methods")
      .eq("team_id", teamId)
      .eq("catalog_kind_id", kindId)
      .not("methods", "is", null)
      .order("created_at", { ascending: false })
      .limit(HISTORY_ROWS),
  ]);
  if (methodError) throw methodError;

  const usage = new Map<string, number>();
  for (const row of (historyRows ?? []) as Array<{ methods: unknown }>) {
    if (!Array.isArray(row.methods)) continue;
    for (const entry of row.methods) {
      const methodId = (entry as { method_id?: unknown })?.method_id;
      if (typeof methodId === "string") usage.set(methodId, (usage.get(methodId) ?? 0) + 1);
    }
  }

  const methods = ((methodRows ?? []) as KindMethodOption[])
    .map((row) => ({ id: row.id, name: row.name }))
    .sort(
      (left, right) =>
        (usage.get(right.id) ?? 0) - (usage.get(left.id) ?? 0) || left.name.localeCompare(right.name, "uk")
    );

  const places = ((placeRows ?? []) as Array<{ id: string; label: string | null }>)
    .filter((row) => Boolean(row.id && row.label?.trim()))
    .map((row) => ({ id: row.id, label: (row.label ?? "").trim() }));

  return { methods, places };
}

export function useKindImprintOptions(teamId: string, kindIds: string[]) {
  const [byKind, setByKind] = React.useState<Record<string, KindImprintOptions>>({});
  const requested = React.useRef(new Set<string>());
  const wanted = kindIds.filter((id, index) => kindIds.indexOf(id) === index).join(" ");
  const [directory, setDirectory] = React.useState<DirectoryMethodOption[] | null>(null);
  const [directoryFailed, setDirectoryFailed] = React.useState(false);
  const directoryRequested = React.useRef(false);

  React.useEffect(() => {
    if (!teamId) return;
    let alive = true;
    for (const kindId of wanted.split(" ").filter(Boolean)) {
      if (requested.current.has(kindId)) continue;
      requested.current.add(kindId);
      void loadKindOptions(teamId, kindId)
        .then((options) => {
          if (alive) setByKind((prev) => ({ ...prev, [kindId]: options }));
        })
        .catch(() => {
          // Наступна позиція того ж виду спробує ще раз — може, це був збій мережі.
          requested.current.delete(kindId);
        });
    }
    return () => {
      alive = false;
    };
  }, [teamId, wanted]);

  const requestDirectory = React.useCallback(() => {
    if (!teamId || directoryRequested.current) return;
    directoryRequested.current = true;
    setDirectoryFailed(false);
    void loadMethodDirectory(teamId)
      .then(setDirectory)
      .catch(() => {
        // Наступне розгортання «Інших методів» спробує ще раз.
        directoryRequested.current = false;
        setDirectoryFailed(true);
      });
  }, [teamId]);

  const attachMethod = React.useCallback(
    async (kindId: string, entry: DirectoryMethodOption) => {
      const method = await attachDirectoryMethod(teamId, kindId, entry);
      /*
        Метод тепер у списку виду — там, де його шукатимуть наступного разу.
        ДОПИСУЄМО В КІНЕЦЬ, А НЕ ПЕРЕЧИТУЄМО: порядок за історією лишається
        тим, до якого людина вже звикла в цьому вікні, а назву нового методу
        чип знає одразу, без «Метод» на час трьох запитів.
      */
      setByKind((prev) => {
        const current = prev[kindId];
        if (!current || current.methods.some((one) => one.id === method.id)) return prev;
        return { ...prev, [kindId]: { ...current, methods: [...current.methods, method] } };
      });
      return method;
    },
    [teamId]
  );

  /** «Інші методи…» для конкретного виду — те, що отримує смуга нанесення. */
  const directoryFor = React.useCallback(
    (kindId: string): MethodDirectorySource => ({
      entries: directory,
      failed: directoryFailed,
      request: requestDirectory,
      attach: (entry) => attachMethod(kindId, entry),
    }),
    [directory, directoryFailed, requestDirectory, attachMethod]
  );

  const reset = React.useCallback(() => {
    requested.current.clear();
    setByKind({});
    directoryRequested.current = false;
    setDirectory(null);
    setDirectoryFailed(false);
  }, []);

  return { byKind, reset, directoryFor };
}
