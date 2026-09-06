import { describe, expect, it } from "vitest";

import { chatCostUsd, embeddingCostUsd, transcriptionCostUsd } from "../_aiPricing";

// Ціна виклику — це число, яке ніде не падає, коли воно неправильне: звіт
// «AI-кости» просто показує не те, що списав OpenAI. Тож рахунок перевіряємо
// арифметикою, а не оком.

describe("chatCostUsd", () => {
  it("рахує свіжий вхід і вихід за ставками моделі", () => {
    // gpt-5.6-luna: $0.20 / $1.20 за 1M.
    const { costUsd, priceKnown } = chatCostUsd("gpt-5.6-luna", 1_000_000, 1_000_000);
    expect(costUsd).toBe(1.4);
    expect(priceKnown).toBe(true);
  });

  it("кешований вхід коштує вдесятеро дешевше і НЕ додається до входу", () => {
    // 1M входу, з них 900k із кешу: 100k × $0.20/M + 900k × $0.02/M = $0.038.
    const cached = chatCostUsd("gpt-5.6-luna", 1_000_000, 0, 900_000);
    expect(cached.costUsd).toBe(0.038);

    // Той самий виклик без урахування кешу коштував би вп'ятеро більше — саме
    // на цю різницю звіт і завищував суми.
    const blind = chatCostUsd("gpt-5.6-luna", 1_000_000, 0);
    expect(blind.costUsd).toBe(0.2);
  });

  it("кеш більший за вхід не робить рахунок відʼємним", () => {
    const { costUsd } = chatCostUsd("gpt-5.6-luna", 1000, 0, 999_999);
    expect(costUsd).toBeGreaterThanOrEqual(0);
    expect(costUsd).toBe(chatCostUsd("gpt-5.6-luna", 1000, 0, 1000).costUsd);
  });

  it("невідома модель рахується за замовчуванням і помічається priceKnown: false", () => {
    const { costUsd, priceKnown } = chatCostUsd("gpt-4o-mini", 1_000_000, 0);
    expect(priceKnown).toBe(false);
    expect(costUsd).toBe(2.5);
  });

  it("порожні токени дають нуль, а не NaN", () => {
    expect(chatCostUsd("gpt-5.6-luna", null, undefined).costUsd).toBe(0);
    expect(chatCostUsd(null, 100, 100).costUsd).toBeGreaterThan(0);
  });

  it("аліас gpt-5.6 коштує стільки ж, скільки Sol", () => {
    expect(chatCostUsd("gpt-5.6", 1_000_000, 1_000_000).costUsd).toBe(
      chatCostUsd("gpt-5.6-sol", 1_000_000, 1_000_000).costUsd
    );
  });
});

describe("transcriptionCostUsd", () => {
  it("рахує за хвилинами аудіо", () => {
    // gpt-transcribe — $0.0045 за хвилину.
    expect(transcriptionCostUsd("gpt-transcribe", 120).costUsd).toBe(0.009);
  });

  it("відʼємна чи порожня тривалість — нуль", () => {
    expect(transcriptionCostUsd("gpt-transcribe", -5).costUsd).toBe(0);
    expect(transcriptionCostUsd("gpt-transcribe", null).costUsd).toBe(0);
  });
});

describe("embeddingCostUsd", () => {
  it("рахує за токенами", () => {
    expect(embeddingCostUsd("text-embedding-3-small", 1_000_000).costUsd).toBe(0.02);
  });
});
