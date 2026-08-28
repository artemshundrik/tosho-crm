import { describe, expect, it } from "vitest";
import { checkMessage, formatProblems, stripScissors } from "./devRequestCommitGate.mjs";

/**
 * Гейт існує заради одного: щоб «REQ-N у тексті» перестало бути станом, який
 * тлумачиться мовчки. Або трейлер, або слова. Тому найважливіші тести тут —
 * не про формат, а про два колишні тихі результати: чужа картка поїхала й
 * своя не поїхала.
 */

describe("проза з REQ-номером зупиняє коміт", () => {
  it("рядок, який коштував REQ-17", () => {
    const message = [
      "Черга запитів у Telegram і ззовні тепер показує, що взято на сьогодні",
      "",
      "Основна вибірка — 50 найсвіжіших, і стара картка (REQ-17 заведено в",
      "травні) у неї не потрапляє.",
    ].join("\n");
    const problems = checkMessage(message);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ kind: "prose", number: 17, item: null, line: 3 });
  });

  it("трейлер поруч не рятує — проза лишається прозою", () => {
    const message = "fix: щось\n\nЦе не те саме, що REQ-133.\n\nЗакриває: REQ-135";
    expect(checkMessage(message).map((problem) => problem.number)).toEqual([133]);
  });

  it("адресована згадка в прозі — теж стоп", () => {
    expect(checkMessage("fix: щось\n\nПро це є в REQ-180#p1.")).toHaveLength(1);
  });
});

describe("чистий коміт проходить", () => {
  it("без жодного номера", () => {
    expect(checkMessage("chore: підняв залежності")).toEqual([]);
  });

  it("тільки трейлер", () => {
    expect(checkMessage("fix: щось\n\nЗакриває: REQ-17")).toEqual([]);
    expect(checkMessage("fix: щось\n\nЗакриває: REQ-17, REQ-180#p1")).toEqual([]);
  });

  it("номер словами — саме те, чого гейт і домагається", () => {
    expect(checkMessage("fix: щось\n\nСтара картка про ТТН заведена в травні.")).toEqual([]);
  });

  it("коментарі git не рахуються — їх у коміті не буде", () => {
    expect(checkMessage("fix: щось\n\n# On branch REQ-17\n# Changes to be committed:")).toEqual([]);
  });
});

describe("трейлер без розібраної адреси", () => {
  it("одрук в адресі більше не тоне в тиші", () => {
    // До 27.08.2026 «REQ-123#t3» не збігався взагалі, і хук мовчки не робив
    // нічого. Регулярку тоді полагодили, але сам клас помилки лишався тихим:
    // будь-який інший одрук давав той самий результат — жодного.
    const problems = checkMessage("fix: щось\n\nЗакриває: REQ-180#p1abc");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ kind: "empty", line: 3 });
  });

  it("картка словами в трейлері — теж одрук", () => {
    expect(checkMessage("fix: щось\n\nЗакриває: картку 180")).toHaveLength(1);
  });
});

describe("хвіст із дифом", () => {
  it("REQ- у показаному дифі не є згадкою", () => {
    // git commit --verbose дописує діф ПІСЛЯ ножиць, і рядки дифа не
    // закоментовані. Без різу гейт спіткнувся б об власний же код.
    const message = [
      "fix: щось",
      "",
      "# ------------------------ >8 ------------------------",
      "diff --git a/scripts/lib/devRequestCommitHook.mjs b/…",
      "+  it(\"одна згадка\", () => expect(x).toEqual(\"REQ-17\"));",
    ].join("\n");
    expect(stripScissors(message)).toBe("fix: щось\n\n");
    expect(checkMessage(message)).toEqual([]);
  });
});

describe("текст для людини", () => {
  it("показує рядок, номер і обидва виходи", () => {
    const text = formatProblems(checkMessage("fix: щось\n\nСтара картка REQ-17 тут."));
    expect(text).toContain("рядок 3");
    expect(text).toContain("REQ-17");
    expect(text).toContain("Закриває: REQ-17");
    expect(text).toContain("картка 17");
    expect(text).toContain("git commit --no-verify");
  });
});
