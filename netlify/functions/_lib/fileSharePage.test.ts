import { describe, expect, it } from "vitest";

import { renderFileSharePage } from "./fileSharePage";

const base = {
  code: "Ab3xK9P2qZ",
  baseUrl: "https://tosho.pro",
  title: "Макети",
  managerName: "Влад",
  expiresAt: "2026-12-09T12:00:00.000Z",
};

describe("renderFileSharePage", () => {
  it("екранує назву файлу й заголовок", () => {
    const html = renderFileSharePage({
      ...base,
      title: `"><script>alert(1)</script>`,
      files: [{ name: `<img src=x onerror=alert(1)>.pdf`, hasPreview: false }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
  });

  it("дає картку месенджеру з першого файлу, що має прев'ю", () => {
    const html = renderFileSharePage({
      ...base,
      files: [
        { name: "a.ai", hasPreview: false },
        { name: "b.pdf", hasPreview: true },
      ],
    });
    expect(html).toContain(`og:image" content="https://tosho.pro/f/Ab3xK9P2qZ/c"`);
    expect(html).toContain(`og:description" content="2 файли · менеджер Влад"`);
  });

  it("не показує довгих адрес сховища", () => {
    const html = renderFileSharePage({ ...base, files: [{ name: "a.pdf", hasPreview: true }] });
    expect(html).not.toContain("supabase");
    expect(html).toContain("Файли доступні до 9 грудня");
  });

  it("виносить номер із заголовка, а картці лишає повну назву", () => {
    const html = renderFileSharePage({
      ...base,
      title: "Візуали для АСТЕРА · TS-1126-0021",
      files: [{ name: "a.webp", hasPreview: true }],
    });
    expect(html).toContain("<h1>Візуали для АСТЕРА</h1>");
    expect(html).toContain(`<p class="meta">TS-1126-0021</p>`);
    expect(html).toContain(`og:title" content="Візуали для АСТЕРА · TS-1126-0021"`);
  });

  it("показує картинку з великого джерела, а не з малого прев'ю", () => {
    const html = renderFileSharePage({ ...base, files: [{ name: "a.webp", hasPreview: true }] });
    expect(html).toContain(`src="/f/Ab3xK9P2qZ/v/0"`);
    expect(html).not.toContain("data-zip");
  });

  it("один PDF відкриває переглядом, а в добірці дає «Відкрити»", () => {
    const one = renderFileSharePage({ ...base, files: [{ name: "kp.pdf", hasPreview: true }] });
    expect(one).toContain(`data-src="/f/Ab3xK9P2qZ/d/0"`);

    const many = [
      { name: "a.webp", hasPreview: true },
      { name: "kp.pdf", hasPreview: true },
    ];
    const list = renderFileSharePage({ ...base, files: many });
    expect(list).not.toContain("data-pdf");
    expect(list).toContain(`href="/f/Ab3xK9P2qZ/o/1"`);
    expect(list).toContain("data-zip");

    const opened = renderFileSharePage({ ...base, files: many, openIndex: 1 });
    expect(opened).toContain(`data-src="/f/Ab3xK9P2qZ/d/1"`);
    expect(opened).toContain("Усі файли");
  });

  it("не приймає відкриттям те, що не PDF", () => {
    const html = renderFileSharePage({
      ...base,
      files: [
        { name: "a.webp", hasPreview: true },
        { name: "b.docx", hasPreview: false },
      ],
      openIndex: 0,
    });
    expect(html).not.toContain("data-pdf");
  });

  it("файл без прев'ю показує ілюстрацією свого формату", () => {
    const html = renderFileSharePage({
      ...base,
      files: [
        { name: "dogovir.docx", hasPreview: false },
        { name: "maket.ai", hasPreview: false },
      ],
    });
    expect(html).toContain(">DOCX</text>");
    expect(html).toContain(">AI</text>");
    expect(html).toContain("Відкривається в Adobe Illustrator");
    expect(html).not.toContain("Без прев'ю");
  });
});
