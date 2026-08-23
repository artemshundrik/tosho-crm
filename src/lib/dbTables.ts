import type { Database } from "./database.types";

/**
 * Короткі імена для типів таблиць схеми `tosho`.
 *
 * НАВІЩО. Повний шлях `Database["tosho"]["Tables"]["customers"]["Update"]` —
 * 52 символи, і в місцях, де він потрібен найбільше (складання payload у
 * гігантських сторінках), рядок від нього переповзає за межу читабельності.
 * Через це такі місця роками писались як `Record<string, unknown>` — коротко,
 * але без жодної перевірки.
 *
 * ЧОМУ ЦЕ ВАЖЛИВО САМЕ ЗАРАЗ. З версії 2.110 supabase-js звіряє payload із
 * типом таблиці й відкидає зайві поля. Це поліпшення: раніше друкарська
 * помилка в імені колонки мовчки летіла в базу й поверталась помилкою вже в
 * рантаймі, а тепер її видно на етапі складання. Але скористатись цим можна
 * лише там, де payload має справжній тип, а не `Record<string, unknown>` —
 * бо такий запис вимикає перевірку разом із помилками.
 *
 * ЯК КОРИСТУВАТИСЬ. Оголошуй payload типом таблиці, а не приводь до нього
 * силою:
 *
 *     const payload: TableUpdate<"customers"> = { name, phone };   // перевірка є
 *     supabase.from("customers").update(payload as TableUpdate<"customers">); // перевірки немає
 *
 * Приведення лишається доречним тільки там, де об'єкт справді збирається
 * динамічно й довести його форму типами неможливо.
 */
type Tables = Database["tosho"]["Tables"];

/** Рядок таблиці, яким його віддає база. */
export type TableRow<T extends keyof Tables> = Tables[T]["Row"];

/** Те, що приймає `.insert()`: обовʼязкові колонки без значень за замовчуванням. */
export type TableInsert<T extends keyof Tables> = Tables[T]["Insert"];

/** Те, що приймає `.update()`: усі колонки необовʼязкові. */
export type TableUpdate<T extends keyof Tables> = Tables[T]["Update"];
