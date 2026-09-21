import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { buildCommercialDocument } from "@/features/quotes/commercial-document/build";
import {
  renderCommercialDocumentHtml,
  type CommercialDocument,
} from "@/features/quotes/commercial-document/document";
import {
  downloadCommercialPdf,
  downloadCommercialWorkbook,
  printCommercialHtml,
} from "@/features/quotes/commercial-document/outputs";

/**
 * «Надіслати пропозицію» з картки прорахунку (REQ-296#p2, #p3).
 *
 * ВІКНО ВІДКРИВАЄТЬСЯ ОДРАЗУ, А НЕ ПІСЛЯ ЗБИРАННЯ. Документ збирається 6–10
 * секунд (заміряно на дошці), і весь цей час єдиною відповіддю на клік була б
 * сіра кнопка. Саме на цьому роками горіло «Прев'ю» в наборах: люди тиснули
 * вдруге й приписували успіх другому кліку. Тому спершу вікно, потім вміст; а
 * швидкі дії зі стрілочки показують тост зі станом, бо вікна в них немає.
 *
 * ПОМИЛКА ЛИШАЄТЬСЯ У ВІКНІ. Гейт націнки (REQ-149) відмовляє зібрати документ
 * цілком законно — і його текст пояснює, що робити. Тост із цим текстом зникає
 * за кілька секунд разом із поясненням, тож повідомлення живе там, де людина
 * дивиться.
 */

export type OfferFormat = "pdf" | "xlsx" | "print";

export type QuoteOfferSource = {
  id: string;
  number?: string | null;
  status?: string | null;
  created_at?: string | null;
  total?: number | null;
  customer_name?: string | null;
};

const DEFAULT_VALID_DAYS = 14;

const isoPlusDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatValidUntil = (iso: string) => {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
};

export function useQuoteOfferSend(params: {
  teamId: string;
  quote: QuoteOfferSource | null;
  managerName?: string | null;
}) {
  const { teamId, quote, managerName } = params;

  const [open, setOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [doc, setDoc] = useState<CommercialDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<OfferFormat>("pdf");
  const [validUntil, setValidUntil] = useState(() => isoPlusDays(DEFAULT_VALID_DAYS));
  const [includeVisualizations, setIncludeVisualizations] = useState(true);

  const build = useCallback(async () => {
    if (!quote) return null;
    return buildCommercialDocument({
      teamId,
      quotes: [
        {
          id: quote.id,
          number: quote.number,
          status: quote.status,
          createdAt: quote.created_at,
          total: quote.total,
        },
      ],
      title: "Комерційна пропозиція",
      kindLabel: "КП",
      customerName: quote.customer_name?.trim() || "Замовник не вказаний",
      createdAt: quote.created_at ?? null,
    });
  }, [quote, teamId]);

  /**
   * Налаштування форми накладаються НА ГОТОВИЙ документ, а не викликають
   * перезбирання: зняти галочку з візуалізацій і чекати ще вісім секунд —
   * покарання за цікавість.
   */
  const decorated = useMemo(() => {
    if (!doc) return null;
    return {
      ...doc,
      validUntil: formatValidUntil(validUntil) || undefined,
      manager: managerName ? { name: managerName } : undefined,
      sections: includeVisualizations
        ? doc.sections
        : doc.sections.map((section) => ({ ...section, visualizations: [] })),
    } satisfies CommercialDocument;
  }, [doc, includeVisualizations, managerName, validUntil]);

  const previewHtml = useMemo(
    () => (decorated ? renderCommercialDocumentHtml(decorated) : ""),
    [decorated]
  );

  /** Позиції без фото — те, що менеджер має побачити ДО надсилання. */
  const itemsWithoutPhoto = useMemo(() => {
    if (!doc) return [] as number[];
    return doc.sections.flatMap((section) =>
      section.items.filter((item) => !item.imageUrl).map((item) => item.position)
    );
  }, [doc]);

  const visualizationCount = useMemo(
    () => doc?.sections.reduce((sum, section) => sum + section.visualizations.length, 0) ?? 0,
    [doc]
  );

  const openDialog = useCallback(() => {
    setDoc(null);
    setError(null);
    setOpen(true);
    setBuilding(true);
    void build()
      .then((next) => {
        if (!next) {
          setError("Немає даних для документа.");
          return;
        }
        setDoc(next);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Не вдалося зібрати документ.");
      })
      .finally(() => setBuilding(false));
  }, [build]);

  const emit = useCallback(async (target: CommercialDocument, kind: OfferFormat) => {
    if (kind === "xlsx") {
      await downloadCommercialWorkbook(target);
      toast.success("Файл для Excel збережено");
      return;
    }
    if (kind === "pdf") {
      await downloadCommercialPdf(target);
      toast.success("PDF збережено");
      return;
    }
    printCommercialHtml(renderCommercialDocumentHtml(target));
  }, []);

  const submit = useCallback(() => {
    if (!decorated) return;
    void emit(decorated, format);
    setOpen(false);
  }, [decorated, emit, format]);

  /** Швидка дія зі стрілочки: без вікна, але зі станом у тості. */
  const runQuick = useCallback(
    async (kind: OfferFormat) => {
      const progress = toast.loading("Збираємо документ…");
      try {
        const next = await build();
        if (!next) {
          toast.error("Немає даних для документа", { id: progress });
          return;
        }
        toast.dismiss(progress);
        await emit(
          {
            ...next,
            validUntil: formatValidUntil(validUntil) || undefined,
            manager: managerName ? { name: managerName } : undefined,
          },
          kind
        );
      } catch (cause: unknown) {
        toast.error("Не вдалося зібрати документ", {
          id: progress,
          description: cause instanceof Error ? cause.message : undefined,
        });
      }
    },
    [build, emit, managerName, validUntil]
  );

  return {
    open,
    setOpen,
    openDialog,
    building,
    error,
    doc: decorated,
    previewHtml,
    format,
    setFormat,
    validUntil,
    setValidUntil,
    includeVisualizations,
    setIncludeVisualizations,
    itemsWithoutPhoto,
    visualizationCount,
    submit,
    runQuick,
  };
}
