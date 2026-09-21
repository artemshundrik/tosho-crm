import { QuoteOfferSendButton } from "./QuoteOfferSendButton";
import { QuoteOfferSendDialog } from "./QuoteOfferSendDialog";
import { useQuoteOfferSend, type QuoteOfferSource } from "./useQuoteOfferSend";

/**
 * Надсилання пропозиції як один вузол: кнопка, вікно й стан між ними.
 *
 * ЧОМУ ЗІБРАНО В ОДНЕ. Кнопка стоїть у рейці картки, вікно — портал, тож жити
 * вони можуть поруч; а от стан у них спільний. Якби сторінка тримала хук і
 * розставляла обидва компоненти сама, у `QuoteDetailsPage` осіло б двадцять
 * рядків прокидання пропсів — рівно те, від чого файл і стережуть ратчетом.
 * Тепер сторінка знає про надсилання рівно три речі: команду, прорахунок і
 * менеджера.
 */
export function QuoteOfferSend(props: {
  teamId: string;
  quote: QuoteOfferSource | null;
  managerName?: string | null;
}) {
  const offer = useQuoteOfferSend(props);

  const sentLabel = offer.sentAt
    ? new Date(offer.sentAt).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })
    : null;

  return (
    <>
      {/* Позначка живе поруч із кнопкою, а не в шапці сторінки: питання «а ми
          йому вже відправляли?» виникає рівно в мить, коли рука тягнеться
          надіслати ще раз. */}
      {sentLabel ? (
        <span className="rounded-md bg-success-soft px-2 py-1 text-2xs font-medium text-success-foreground">
          Надіслано {sentLabel}
        </span>
      ) : null}
      <QuoteOfferSendButton
        disabled={!props.quote}
        onOpen={offer.openDialog}
        onQuick={(format) => void offer.runQuick(format)}
      />
      <QuoteOfferSendDialog
        open={offer.open}
        onOpenChange={offer.setOpen}
        quoteNumber={props.quote?.number ?? ""}
        customerName={props.quote?.customer_name?.trim() || "Замовник не вказаний"}
        building={offer.building}
        error={offer.error}
        previewHtml={offer.previewHtml}
        format={offer.format}
        onFormatChange={offer.setFormat}
        validUntil={offer.validUntil}
        onValidUntilChange={offer.setValidUntil}
        includeVisualizations={offer.includeVisualizations}
        onIncludeVisualizationsChange={offer.setIncludeVisualizations}
        visualizationCount={offer.visualizationCount}
        itemsWithoutPhoto={offer.itemsWithoutPhoto}
        markSent={offer.markSent}
        onMarkSentChange={offer.setMarkSent}
        onSubmit={offer.submit}
      />
    </>
  );
}
