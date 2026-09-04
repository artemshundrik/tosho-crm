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
 */

export type KindMethodOption = { id: string; name: string };
export type KindPlaceOption = { id: string; label: string };
export type KindImprintOptions = { methods: KindMethodOption[]; places: KindPlaceOption[] };

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

  const reset = React.useCallback(() => {
    requested.current.clear();
    setByKind({});
  }, []);

  return { byKind, reset };
}
