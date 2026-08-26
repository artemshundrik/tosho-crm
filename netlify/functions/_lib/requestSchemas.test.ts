import { describe, expect, it } from "vitest";

import { inviteRequestSchema } from "../create-workspace-invite";
import { requestSchema as absenceSchema } from "../team-absence-request";
import { requestSchema as toshoAiSchema } from "../tosho-ai";
import { validateBody } from "./parseBody";

/**
 * Схеми проти СПРАВЖНІХ тіл, які шле клієнт.
 *
 * ЧОМУ ЦЕЙ ФАЙЛ Є. Тести REQ-137 перевіряли хелпер `parseBody` на схемі,
 * ВИГАДАНІЙ для тесту, — і тому не помітили, що дві живі схеми відхиляють
 * власний фронтенд. `z.string().optional()` пропускає `undefined`, але не
 * `null`, а в JSON немає `undefined`: браузер шле `null` там, де в JS стояло
 * `x ?? null`. До REQ-137 тіло не звірялось узагалі, тож ці `null` роками
 * проходили; 24.08.2026 вони почали давати 400.
 *
 * Що зламалось у проді (знайдено 26.08.2026):
 *   • ToSho AI — `requestId: null` у КОЖНОМУ bootstrap, тобто помічник не
 *     відкривався взагалі;
 *   • заявки на відсутність — `comment: null`, коли коментар не заповнили;
 *   • запасний шлях профілю учасника — три поля, яких схема не знала, а
 *     `.strict()` через них відхиляв увесь запит.
 *
 * Тому тіла нижче списані з клієнта дослівно. Міняється клієнт — має
 * мінятись і цей файл, інакше він нічого не стереже.
 */

describe("tosho-ai: тіла з ToShoAiConsole", () => {
  const routeContext = {
    pathname: "/design",
    search: "",
    href: "https://tosho.pro/design",
    title: "Дизайн",
    routeLabel: "Дизайн",
    domainHint: "design" as const,
    entityType: null,
    entityId: null,
  };

  it("bootstrap без відкритої нитки: requestId = null", () => {
    // loadSnapshot() має requestId = null за замовчуванням, тобто це найперший
    // запит, який робить помічник. Саме він і падав.
    const result = validateBody(
      {
        action: "bootstrap",
        requestId: null,
        routeContext,
        includeHistory: false,
        includeKnowledge: false,
      },
      toshoAiSchema
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("send у новій нитці: requestId = null", () => {
    const result = validateBody(
      {
        action: "send",
        requestId: null,
        message: "Хто взяв задачу по дизайну?",
        mode: "ask",
        routeContext,
        attachments: [],
        includeHistory: true,
        includeKnowledge: false,
      },
      toshoAiSchema
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("upsert_knowledge поза ниткою: requestId = null", () => {
    const result = validateBody(
      {
        action: "upsert_knowledge",
        requestId: null,
        routeContext,
        includeHistory: false,
        includeKnowledge: true,
        knowledge: {
          title: "Як завести замовлення",
          slug: "order-create",
          summary: null,
          body: "…",
          tags: [],
          keywords: [],
          status: "active",
          sourceLabel: null,
          sourceHref: null,
        },
      },
      toshoAiSchema
    );
    expect(result).toMatchObject({ ok: true });
  });
});

describe("team-absence-request: тіла з src/lib/teamAbsences.ts", () => {
  it("подання власної заявки без коментаря: comment = null", () => {
    const result = validateBody(
      {
        action: "submit",
        kind: "wfh",
        startDate: "2026-08-31",
        endDate: "2026-08-31",
        comment: null,
      },
      absenceSchema
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("запис за людину керівництвом: comment = null", () => {
    const result = validateBody(
      {
        action: "record",
        userId: "11111111-1111-1111-1111-111111111111",
        kind: "vacation",
        startDate: "2026-09-01",
        endDate: "2026-09-05",
        comment: null,
        status: "approved",
      },
      absenceSchema
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("рішення по заявці без коментаря: comment = null", () => {
    const result = validateBody(
      {
        action: "decide",
        absenceId: "22222222-2222-2222-2222-222222222222",
        decision: "approved",
        comment: null,
      },
      absenceSchema
    );
    expect(result).toMatchObject({ ok: true });
  });
});

describe("create-workspace-invite: тіла з TeamMembersPage", () => {
  it("запасний шлях update_member_profile приймає всі поля форми", () => {
    // Ці три поля (`availabilityStartDate`, `availabilityEndDate`,
    // `employmentStatus`) клієнт шле з першого дня — просто раніше їх ніхто не
    // звіряв, і `.strict()` почав валити весь запит через них.
    const result = validateBody(
      {
        mode: "update_member_profile",
        userId: "33333333-3333-3333-3333-333333333333",
        firstName: "Олена",
        lastName: "Ковальчук",
        birthDate: "",
        phone: "",
        availabilityStatus: "vacation",
        availabilityStartDate: "2026-09-01",
        availabilityEndDate: "2026-09-10",
        startDate: "2025-01-15",
        probationEndDate: "",
        employmentStatus: "active",
        managerUserId: "",
        moduleAccess: { overview: true, orders: true, finance: false },
      },
      inviteRequestSchema
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("невідоме поле все одно відхиляється — сторож не розслабився", () => {
    const result = validateBody(
      { mode: "update_member_roles", userId: "u1", accessRole: "member", hackerField: 1 },
      inviteRequestSchema
    );
    expect(result.ok).toBe(false);
  });
});
