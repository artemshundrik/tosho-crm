import { describe, expect, it } from "vitest";

import {
  forwardOriginName,
  isForwardedMessage,
  isPrivateChat,
  parseCommand,
  telegramUserName,
} from "./telegramUpdate";

// Живцем бот не тестується — потрібен справжній Telegram. Тому вся логіка, яка
// вирішує «що це прилетіло», зведена в чисті функції й накрита тут.

describe("isPrivateChat", () => {
  it("особистий чат — так", () => {
    expect(isPrivateChat({ id: 42, type: "private" })).toBe(true);
  });

  it("група, супергрупа й канал — ні", () => {
    expect(isPrivateChat({ id: -100, type: "group" })).toBe(false);
    expect(isPrivateChat({ id: -100, type: "supergroup" })).toBe(false);
    expect(isPrivateChat({ id: -100, type: "channel" })).toBe(false);
  });

  it("без типу й без чату — ні: промовчати в особистих дешевше, ніж заговорити в групі", () => {
    expect(isPrivateChat({ id: 42 })).toBe(false);
    expect(isPrivateChat(undefined)).toBe(false);
    expect(isPrivateChat(null)).toBe(false);
  });
});

describe("parseCommand", () => {
  it("команда без аргументів", () => {
    expect(parseCommand("/menu")).toEqual({ command: "/menu", args: "" });
  });

  it("аргументи — усе після першого пробілу, з обрізаними краями", () => {
    expect(parseCommand("/start   abc123  ")).toEqual({ command: "/start", args: "abc123" });
  });

  it("зрізає @botname — скопійована з групи команда має спрацювати", () => {
    expect(parseCommand("/задача@ToShoCRM_bot кнопка не тисне")).toEqual({
      command: "/задача",
      args: "кнопка не тисне",
    });
    expect(parseCommand("/settings@ToShoCRM_bot")).toEqual({ command: "/settings", args: "" });
  });

  it("кирилична команда розбирається так само, як латинська", () => {
    expect(parseCommand("/задача не працює пошук")).toEqual({
      command: "/задача",
      args: "не працює пошук",
    });
  });

  it("регістр команди не має значення, аргументи не чіпаємо", () => {
    expect(parseCommand("/Task Кнопка «Зберегти»")).toEqual({
      command: "/task",
      args: "Кнопка «Зберегти»",
    });
  });

  it("багаторядковий аргумент лишається багаторядковим", () => {
    expect(parseCommand("/task перший рядок\nдругий рядок")).toEqual({
      command: "/task",
      args: "перший рядок\nдругий рядок",
    });
  });

  it("не команда — null (щоб текст поїхав асистенту, як і раніше)", () => {
    expect(parseCommand("хто сьогодні відсутній?")).toEqual({ command: null, args: "" });
    expect(parseCommand("📋 Меню")).toEqual({ command: null, args: "" });
    expect(parseCommand("")).toEqual({ command: null, args: "" });
    expect(parseCommand(undefined)).toEqual({ command: null, args: "" });
  });

  it("сама коса командою не є", () => {
    expect(parseCommand("/")).toEqual({ command: null, args: "" });
    expect(parseCommand("/ task")).toEqual({ command: null, args: "" });
  });
});

describe("isForwardedMessage", () => {
  it("нове forward_origin — переслане", () => {
    expect(isForwardedMessage({ text: "х", forward_origin: { type: "user" } })).toBe(true);
    expect(isForwardedMessage({ text: "х", forward_origin: { type: "hidden_user" } })).toBe(true);
  });

  it("старі поля теж рахуються", () => {
    expect(isForwardedMessage({ text: "х", forward_from: { id: 1 } })).toBe(true);
    expect(isForwardedMessage({ text: "х", forward_sender_name: "Наталя" })).toBe(true);
    expect(isForwardedMessage({ text: "х", forward_from_chat: { id: -100, title: "Чат" } })).toBe(true);
    expect(isForwardedMessage({ text: "х", forward_date: 1_700_000_000 })).toBe(true);
  });

  it("звичайне повідомлення — ні", () => {
    expect(isForwardedMessage({ text: "просто написав" })).toBe(false);
    expect(isForwardedMessage({ text: "х", forward_sender_name: "  " })).toBe(false);
    expect(isForwardedMessage({ text: "х", forward_date: null })).toBe(false);
    expect(isForwardedMessage(undefined)).toBe(false);
  });
});

describe("telegramUserName", () => {
  it("ім'я з прізвищем", () => {
    expect(telegramUserName({ first_name: "Марʼяна", last_name: "Андроскова" })).toBe(
      "Марʼяна Андроскова"
    );
  });

  it("лише ім'я", () => {
    expect(telegramUserName({ first_name: "Ілля" })).toBe("Ілля");
  });

  it("без імені — @username; без нічого — null", () => {
    expect(telegramUserName({ username: "seo_olena" })).toBe("@seo_olena");
    expect(telegramUserName({ id: 5 })).toBeNull();
    expect(telegramUserName(null)).toBeNull();
  });
});

describe("forwardOriginName", () => {
  it("звичайне пересилання від людини", () => {
    expect(
      forwardOriginName({
        forward_origin: { type: "user", sender_user: { first_name: "Дарʼя", last_name: "Мезенцева" } },
      })
    ).toBe("Дарʼя Мезенцева");
  });

  it("прихований автор — ім'я, яке дав Telegram", () => {
    expect(
      forwardOriginName({ forward_origin: { type: "hidden_user", sender_user_name: "Наталя" } })
    ).toBe("Наталя");
  });

  it("з каналу — назва каналу", () => {
    expect(
      forwardOriginName({ forward_origin: { type: "channel", chat: { id: -100, title: "ToSho новини" } } })
    ).toBe("ToSho новини");
  });

  it("старі поля як запасний варіант", () => {
    expect(forwardOriginName({ forward_from: { first_name: "Сергій" } })).toBe("Сергій");
    expect(forwardOriginName({ forward_sender_name: "Хтось" })).toBe("Хтось");
    expect(forwardOriginName({ forward_from_chat: { id: -1, title: "Робочий чат" } })).toBe(
      "Робочий чат"
    );
  });

  it("невідомий тип джерела — null, а не вигадане ім'я", () => {
    expect(forwardOriginName({ forward_origin: { type: "щось_нове" } })).toBeNull();
    expect(forwardOriginName({ text: "не переслане" })).toBeNull();
  });
});
