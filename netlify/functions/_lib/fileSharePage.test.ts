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
    expect(html).toContain("09.12.2026");
  });
});
