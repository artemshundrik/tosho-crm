import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Запис повідомлення тримаємо «в повітрі» самі: так видно, що буде, коли
 * панель зникає РАНІШЕ, ніж база відповіла. Відповідь заготовлена наперед —
 * запит у мутації стартує лише після onMutate, і ловити його момент не треба.
 */
const insert = {
  result: Promise.resolve<unknown>(null),
  resolve: (_value: unknown) => {},
};
function holdInsert() {
  insert.result = new Promise((resolve) => {
    insert.resolve = resolve;
  });
}

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => insert.result,
          }),
        }),
      }),
    }),
    auth: { getSession: async () => ({ data: { session: { access_token: "token-1" } } }) },
  },
}));

vi.mock("./threadEvents", () => ({ fetchThreadEvents: vi.fn(async () => []) }));

import { useSendThreadMessage } from "./queries";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSendThreadMessage", () => {
  it("сповіщення йде, навіть коли панель зникла до кінця запису", async () => {
    // 22.09.2026: менеджерка надіслала повідомлення й одразу перейшла в
    // задачу. Сповіщення висіло на колбеку панелі, і з панеллю й пропало.
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    holdInsert();

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useSendThreadMessage("quote:q-1"), { wrapper });

    act(() => {
      result.current.mutate({ body: "Кількість?", teamId: "team-1", quoteId: "q-1", userId: "u-1", visibility: "team" });
    });
    unmount();

    await act(async () => {
      insert.resolve({
        data: {
          id: "m-1",
          body: "Кількість?",
          created_at: "2026-09-22T10:39:51Z",
          created_by: "u-1",
          kind: "message",
          visibility: "team",
          source: "crm",
          is_pinned: false,
          thread_meta: {},
          reply_to: null,
          deleted_at: null,
        },
        error: null,
      });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/.netlify/functions/quote-comments");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
    expect(JSON.parse(String(init.body))).toEqual({
      mode: "notify_thread",
      threadKey: "quote:q-1",
      body: "Кількість?",
    });
  });
});
