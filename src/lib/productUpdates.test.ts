import { describe, expect, it } from "vitest";
import { defaultModuleAccess } from "./moduleAccess";
import {
  DIGEST_LIMIT,
  isUpdateVisible,
  planUpdateModal,
  type ProductUpdate,
  type UpdateViewerContext,
} from "./productUpdates";

/**
 * Ціна помилки тут висока в обидва боки: зайвий показ робить модалку шумом і
 * повторює долю промо (53 покази, 2 кліки), пропущений — знову ховає реліз.
 */

const NOW = new Date("2026-08-06T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function update(patch: Partial<ProductUpdate> = {}): ProductUpdate {
  return {
    id: patch.id ?? Math.random().toString(36).slice(2),
    publishedAt: patch.publishedAt ?? daysAgo(1),
    title: patch.title ?? "Анонс",
    body: patch.body ?? "Опис",
    importance: patch.importance ?? "minor",
    moduleKey: patch.moduleKey ?? null,
    featureKey: patch.featureKey ?? null,
    ctaLabel: patch.ctaLabel ?? null,
    ctaHref: patch.ctaHref ?? null,
  };
}

function viewer(patch: Partial<UpdateViewerContext> = {}): UpdateViewerContext {
  return {
    access: patch.access ?? defaultModuleAccess({ accessRole: "member", jobRole: "designer" }),
    accessRole: patch.accessRole ?? "member",
    joinedAt: patch.joinedAt ?? null,
  };
}

describe("кому видно анонс", () => {
  it("без модуля — видно всім", () => {
    expect(isUpdateVisible(update({ moduleKey: null }), viewer())).toBe(true);
  });

  it("за модулем без доступу — не видно", () => {
    expect(isUpdateVisible(update({ moduleKey: "finance" }), viewer())).toBe(false);
  });

  it("власник бачить і те, до чого модуль вимкнений дефолтами", () => {
    const owner = viewer({
      accessRole: "owner",
      access: defaultModuleAccess({ accessRole: "owner", jobRole: "it_specialist" }),
    });
    expect(isUpdateVisible(update({ moduleKey: "customers" }), owner)).toBe(true);
  });

  it("новачку не показуємо релізи, що вийшли до його приходу", () => {
    const rookie = viewer({ joinedAt: daysAgo(3) });
    expect(isUpdateVisible(update({ publishedAt: daysAgo(30) }), rookie)).toBe(false);
    expect(isUpdateVisible(update({ publishedAt: daysAgo(1) }), rookie)).toBe(true);
  });

  it("сміття замість дати приходу не ховає анонси", () => {
    const broken = viewer({ joinedAt: "не-дата" });
    expect(isUpdateVisible(update({ publishedAt: daysAgo(30) }), broken)).toBe(true);
  });
});

describe("що показати при вході", () => {
  it("нічого, якщо непрочитаних немає", () => {
    expect(planUpdateModal({ unread: [], now: NOW, shownThisSession: false })).toEqual({
      kind: "none",
    });
  });

  it("нічого, якщо модалку вже показували цього сеансу", () => {
    const plan = planUpdateModal({
      unread: [update({ importance: "major" })],
      now: NOW,
      shownThisSession: true,
    });
    expect(plan.kind).toBe("none");
  });

  it("постер — лише для поодинокої великої фічі", () => {
    const plan = planUpdateModal({
      unread: [update({ importance: "major", title: "Диктування" })],
      now: NOW,
      shownThisSession: false,
    });
    expect(plan).toMatchObject({ kind: "poster" });
  });

  it("пачка дрібних покращень модалку НЕ відкриває — лише стрічку", () => {
    // Найчастіший випадок: день правок, кожна корисна, жодна не варта
    // того, щоб зупиняти сімнадцятьох людей на вході.
    const plan = planUpdateModal({
      unread: [
        update({ importance: "minor" }),
        update({ importance: "minor" }),
        update({ importance: "minor" }),
      ],
      now: NOW,
      shownThisSession: false,
    });
    expect(plan.kind).toBe("none");
  });

  it("велика фіча поруч із дрібними — це вже реліз, тобто дайджест", () => {
    const plan = planUpdateModal({
      unread: [update({ importance: "major" }), update({ importance: "minor" })],
      now: NOW,
      shownThisSession: false,
    });
    expect(plan.kind).toBe("digest");
  });

  it("дві великі — теж дайджест, постер лишається рідкісним", () => {
    const plan = planUpdateModal({
      unread: [update({ importance: "major" }), update({ importance: "major" })],
      now: NOW,
      shownThisSession: false,
    });
    expect(plan.kind).toBe("digest");
  });

  it("старі анонси модалкою не турбують — лише стрічкою", () => {
    const plan = planUpdateModal({
      unread: [update({ importance: "major", publishedAt: daysAgo(40) })],
      now: NOW,
      shownThisSession: false,
    });
    expect(plan.kind).toBe("none");
  });

  it("дайджест обрізається і йде від найновішого", () => {
    // Найновіша — велика, інакше модалки взагалі не буде.
    const many = Array.from({ length: DIGEST_LIMIT + 3 }, (_, index) =>
      update({
        title: `Анонс ${index}`,
        publishedAt: daysAgo(index),
        importance: index === 0 ? "major" : "minor",
      })
    );
    const plan = planUpdateModal({ unread: many, now: NOW, shownThisSession: false });
    if (plan.kind !== "digest") throw new Error("очікували дайджест");
    expect(plan.updates).toHaveLength(DIGEST_LIMIT);
    expect(plan.updates[0].title).toBe("Анонс 0");
  });
});
