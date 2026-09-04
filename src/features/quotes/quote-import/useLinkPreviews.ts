import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

import type { QuoteImportDraftItem, QuoteImportLinkPreview } from "./types";

/**
 * Фото товарів у прев'ю імпорту (REQ-236).
 *
 * ЧОМУ ЧЕРГА, А НЕ ОДИН ЗАПИТ. Тридцять магазинів відповідають від пів секунди
 * до восьми, і чекати на найповільніший, щоб показати перші двадцять, — це
 * пів хвилини порожнього екрана. Тут навпаки: список видно одразу, а фото
 * сідають на свої місця по мірі доїзду. П'ять запитів заразом — межа, за якою
 * браузер усе одно ставить решту в чергу, а сайти починають відповідати 429.
 *
 * ЧОМУ НЕ ЧЕРЕЗ РЕАКТ-ЗАПИТ (React Query). Ключ тут — не дані застосунку, а
 * тимчасовий стан одного відкритого вікна: щойно менеджер натисне «Створити»
 * або «Скасувати», ці посилання більше нікому не потрібні. Кеш, який переживе
 * вікно, тут був би не користю, а витоком чужих адрес між прорахунками.
 *
 * СКАСУВАННЯ ОБОВ'ЯЗКОВЕ. Вікно закривають на середині черги постійно, і без
 * прапорця зупинки хвіст із двадцяти запитів продовжував би стукати по чужих
 * сайтах уже після того, як прорахунок створено.
 */

const MAX_PARALLEL = 5;

export type LinkPreviewState = Record<string, QuoteImportLinkPreview>;

type PreviewResponse = {
  status?: string;
  reason?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  sku?: string | null;
};

function toPreview(payload: PreviewResponse | null): QuoteImportLinkPreview {
  const status = payload?.status;
  // Артикул несуть ОБИДВІ гілки (REQ-247): сторінка без фото — це `no_image`,
  // а артикул у її розмітці цілком може бути.
  const sku = payload?.sku?.trim() || null;
  if (status === "done" && payload?.imageUrl) {
    return {
      status: "done",
      imageUrl: payload.imageUrl,
      title: payload.title ?? null,
      sku,
    };
  }
  if (status === "blocked" || status === "no_image" || status === "failed") {
    return {
      status,
      reason: payload?.reason || "Фото дістати не вдалося",
      title: payload?.title ?? null,
      sku,
    };
  }
  return { status: "failed", reason: "Фото дістати не вдалося" };
}

/** Один похід по фото. Мовчазна невдача тут нормальна: причину дасть `toPreview`. */
async function askForPreview(url: string, token: string): Promise<PreviewResponse | null> {
  try {
    const response = await fetch("/.netlify/functions/quote-import-link-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
    const parsed = (await response.json().catch(() => null)) as PreviewResponse | null;
    return response.ok ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Розвідка ОДНОГО посилання — для входу «за посиланням» у візарді (REQ-237#p4).
 * Той самий похід, що й у черги вище, лише без черги: посилання одне, і
 * людина на нього чекає.
 */
export async function fetchLinkPreview(url: string): Promise<QuoteImportLinkPreview> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { status: "failed", reason: "Сесія застаріла — перезайдіть у CRM." };
  return toPreview(await askForPreview(url, token));
}

export function useLinkPreviews() {
  const [previews, setPreviews] = useState<LinkPreviewState>({});
  const runIdRef = useRef(0);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setPreviews({});
  }, []);

  // Розмонтування — той самий сигнал зупинки, що й закриття вікна.
  useEffect(() => () => void (runIdRef.current += 1), []);

  const start = useCallback(async (drafts: QuoteImportDraftItem[]) => {
    runIdRef.current += 1;
    const runId = runIdRef.current;

    const targets = drafts
      .map((draft) => ({ key: draft.key, url: draft.links[0] }))
      .filter((target): target is { key: string; url: string } => Boolean(target.url));

    if (targets.length === 0) {
      setPreviews({});
      return;
    }

    setPreviews(Object.fromEntries(targets.map((t) => [t.key, { status: "pending" as const }])));

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token || runIdRef.current !== runId) return;

    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length && runIdRef.current === runId) {
        const target = targets[cursor];
        cursor += 1;
        const payload = await askForPreview(target.url, token);
        if (runIdRef.current !== runId) return;
        setPreviews((prev) => ({ ...prev, [target.key]: toPreview(payload) }));
      }
    };

    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, targets.length) }, worker));
  }, []);

  return { previews, start, reset };
}

/** Скільки посилань уже відпрацювало — для смуги прогресу в шапці прев'ю. */
export function countSettledPreviews(previews: LinkPreviewState) {
  const values = Object.values(previews);
  return {
    total: values.length,
    settled: values.filter((preview) => preview.status !== "pending").length,
    withPhoto: values.filter((preview) => preview.status === "done").length,
  };
}
