// scripts/lib/rpcContracts.test.mjs
import { describe, expect, it } from "vitest";

import { extractRpcCalls, mismatches } from "./rpcContracts.mjs";

/**
 * Перевірка, яка зупиняє пуш, мусить сама бути перевіреною (REQ-104): помилка
 * в один бік пропускає зламаний виклик на прод, у другий — блокує кожен пуш,
 * і тоді перевірку просто вимкнуть. Обидва боки нижче.
 */

const one = (source, file = "input.ts") => extractRpcCalls(source, file)[0];

describe("схема виклику", () => {
  // Правила зчитані з src/lib/supabaseClient.ts, а не вигадані:
  // db = supabase.schema("tosho") (рядок 71), supabase — сирий клієнт (рядок 119).
  it("db.rpc іде в tosho", () => {
    expect(one('await db.rpc("absence_today");').schema).toBe("tosho");
  });

  it("supabase.rpc іде в public", () => {
    expect(one('await supabase.rpc("acquire_entity_lock", { p_id: 1 });').schema).toBe("public");
  });

  it("явна .schema() перемагає ім'я змінної", () => {
    expect(one('await admin\n  .schema("tosho")\n  .rpc("x", { a: 1 });').schema).toBe("tosho");
  });

  it("клієнт у Netlify-функції без .schema() — це public", () => {
    expect(one('await adminClient.rpc("x", { a: 1 });').schema).toBe("public");
  });

  it("каст у дужках не ховає схему", () => {
    // Саме так написано в orderRecords.ts:2521 — розбір тексту тут помилявся.
    const src = 'await (supabase.schema("tosho") as unknown as T).rpc("next_document_number", { p_kind: 1 });';
    expect(one(src).schema).toBe("tosho");
  });
});

describe("що не рахується викликом", () => {
  it("згадка в рядковому коментарі", () => {
    expect(extractRpcCalls('// приклад: client.rpc("nope")\nawait db.rpc("real");').map((c) => c.name)).toEqual(["real"]);
  });

  it("згадка в docblock", () => {
    // У src/lib/toshoRpc.ts така згадка справді є — на ній падав розбір тексту.
    expect(extractRpcCalls('/** див. client.rpc(...) */\nawait db.rpc("real");').map((c) => c.name)).toEqual(["real"]);
  });

  it("згадка всередині рядка", () => {
    expect(extractRpcCalls('const s = "текст із client.rpc(fake)";')).toEqual([]);
  });
});

describe("витяг виклику", () => {
  it("бере справжній зламаний виклик із activity-log-retention", () => {
    // Фікстура — дослівно те, що пів року мовчало в проді (06.09.2026).
    const source = [
      'const { data, error } = await adminClient.rpc("archive_activity_log_all", {',
      "  batch_limit: 5000,",
      "  max_rounds: 50,",
      "});",
    ].join("\n");

    expect(extractRpcCalls(source)).toEqual([
      { line: 1, schema: "public", name: "archive_activity_log_all", args: ["batch_limit", "max_rounds"], spread: false },
    ]);
  });

  it("бере виклик без аргументів", () => {
    expect(extractRpcCalls('await db.rpc("absence_today")')).toEqual([
      { line: 1, schema: "tosho", name: "absence_today", args: [], spread: false },
    ]);
  });

  it("бачить скорочений запис", () => {
    expect(one('await db.rpc("x", { p_team_id, p_kind })').args).toEqual(["p_team_id", "p_kind"]);
  });

  it("не плутається у вкладеному об'єкті", () => {
    expect(one('await db.rpc("x", { p_payload: { inner: 1 }, p_id: 2 })').args).toEqual(["p_payload", "p_id"]);
  });

  it("розбирає TSX", () => {
    expect(one('const a = <div onClick={() => db.rpc("y", { p_id: 1 })} />;', "C.tsx").name).toBe("y");
  });
});

describe("чого статично не знаємо — кажемо чесно", () => {
  it("динамічне ім'я", () => {
    // nova-poshta.ts і create-workspace-invite.ts справді так роблять.
    expect(one('await userClient.schema("tosho").rpc(rpcName)').name).toBeNull();
  });

  it("розсипані аргументи", () => {
    expect(one('await db.rpc("x", { ...base, p_id: 1 })').spread).toBe(true);
  });

  it("аргументи передані змінною", () => {
    expect(one('await db.rpc("x", params)').spread).toBe(true);
  });
});

describe("звірка з базою", () => {
  const signatures = new Map([
    ["tosho.archive_activity_log_all", new Set(["p_batch_limit", "p_max_rounds"])],
    ["tosho.get_audit_log", new Set(["p_actor_user_id", "p_entity_id", "p_limit"])],
  ]);

  it("ловить справжній баг: чужа схема", () => {
    const calls = [{ line: 44, schema: "public", name: "archive_activity_log_all", args: [], spread: false }];
    expect(mismatches(calls, signatures)[0].kind).toBe("missing-function");
  });

  it("у підказці називає схему, де функція насправді є", () => {
    const calls = [{ line: 44, schema: "public", name: "archive_activity_log_all", args: [], spread: false }];
    expect(mismatches(calls, signatures)[0].detail).toContain("tosho");
  });

  it("ловить справжній баг: чужі імена аргументів", () => {
    const calls = [{ line: 44, schema: "tosho", name: "archive_activity_log_all", args: ["batch_limit", "max_rounds"], spread: false }];
    expect(mismatches(calls, signatures).map((f) => f.kind)).toEqual(["unknown-arg", "unknown-arg"]);
  });

  it("пропущений аргумент — НЕ помилка: у нього може бути значення за замовчуванням", () => {
    // tosho.get_audit_log справді кличеться без p_actor_user_id (queries.ts:99).
    const calls = [{ line: 99, schema: "tosho", name: "get_audit_log", args: ["p_entity_id", "p_limit"], spread: false }];
    expect(mismatches(calls, signatures)).toEqual([]);
  });

  it("правильний виклик не дає нічого", () => {
    const calls = [{ line: 44, schema: "tosho", name: "archive_activity_log_all", args: ["p_batch_limit", "p_max_rounds"], spread: false }];
    expect(mismatches(calls, signatures)).toEqual([]);
  });

  it("динамічне ім'я звітується, але пуш не зупиняє", () => {
    const calls = [{ line: 64, schema: "tosho", name: null, args: [], spread: false }];
    const found = mismatches(calls, signatures);
    expect(found[0].kind).toBe("dynamic-name");
  });
});
