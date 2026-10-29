import { ArrowRight, FileText } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toneDotClass, toneSubtleClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

import {
  DocumentKindBadge,
  DocumentStatusText,
  formatDocumentSum,
  PersonAvatar,
  type DocumentPerson,
} from "./DocumentRows";
import { formatDocumentDate, type RegistryDocument } from "./documentRegistry";

/**
 * Бічний перегляд документа (макет E, частина з варіанта D): кроки, тривога,
 * деталі й те, що відомо з полів замовлення. Справжній журнал дій — окремий
 * пункт картки, тому вкладка зветься «Що відомо», а не «Історія».
 */
const kyivDateTime = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kiev",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatMoment = (at: string, precise: boolean) =>
  precise ? kyivDateTime.format(new Date(at)) : formatDocumentDate(at);

type Props = {
  doc: RegistryDocument;
  manager: DocumentPerson | null;
  accountant: DocumentPerson | null;
  resolvePerson: (userId: string | null) => DocumentPerson | null;
  onOpenOrder: (orderId: string) => void;
  onOpenFile: (path: string) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function PersonLine({ person, empty }: { person: DocumentPerson | null; empty: string }) {
  if (!person) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonAvatar person={person} role="" size={20} />
      <span className="truncate">{person.label}</span>
    </span>
  );
}

export function DocumentPreview({ doc, manager, accountant, resolvePerson, onOpenOrder, onOpenFile }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <DocumentKindBadge doc={doc} />
        <DocumentStatusText doc={doc} />
        <div className="flex-1" />
        {doc.filePath ? (
          <Button size="xs" variant="outline" className="gap-1.5" onClick={() => onOpenFile(doc.filePath!)}>
            <FileText className="h-3.5 w-3.5" />
            Файл
          </Button>
        ) : null}
        {doc.orderId ? (
          <Button size="xs" variant="outline" className="gap-1.5" onClick={() => onOpenOrder(doc.orderId!)}>
            Замовлення
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="min-w-0">
        <div className="truncate font-mono text-xl font-semibold tracking-tight text-foreground" title={doc.number}>
          {doc.number}
        </div>
        <div className="mt-1 truncate text-sm text-muted-foreground">
          {doc.customerName} · від {formatDocumentDate(doc.documentDate)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {doc.steps.map((step) => (
          <div key={step.label} className="flex min-w-0 flex-col gap-1">
            <span className={cn("h-1 rounded-full", step.done ? toneDotClass[doc.status.tone] : "bg-muted")} aria-hidden />
            <span className={cn("text-xs font-semibold", step.done ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
            {step.note ? <span className="text-2xs leading-snug text-muted-foreground">{step.note}</span> : null}
          </div>
        ))}
      </div>

      {doc.alert ? (
        <div className={cn("rounded-xl border px-3.5 py-3 text-sm leading-relaxed", toneSubtleClass[doc.alert.tone])}>
          {doc.alert.text}
        </div>
      ) : null}

      <Tabs defaultValue="details" className="w-full">
        <TabsList variant="underline" className="mb-3 w-full">
          <TabsTrigger value="details">Деталі</TabsTrigger>
          <TabsTrigger value="events">Що відомо · {doc.events.length}</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <dl className="grid grid-cols-[116px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
            <Row label="Сума">
              <span className="figure">{formatDocumentSum(doc)}</span>
            </Row>
            <Row label="Підстава">{doc.basis}</Row>
            <Row label="Наша юрособа">{doc.legalEntityLabel}</Row>
            <Row label="Замовлення">
              {doc.orderId ? (
                <button
                  type="button"
                  className="font-mono text-primary hover:underline"
                  onClick={() => onOpenOrder(doc.orderId!)}
                >
                  {doc.orderNumber}
                </button>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
            <Row label="Менеджер">
              <PersonLine person={manager} empty="не призначено" />
            </Row>
            <Row label="Бухгалтер">
              <PersonLine person={accountant} empty={doc.kind === "invoice" ? "не відомо" : "—"} />
            </Row>
            <Row label="Внесено">
              <span className="figure">{formatMoment(doc.createdAt, doc.createdAtPrecise)}</span>
            </Row>
          </dl>
        </TabsContent>
        <TabsContent value="events">
          <ol className="flex flex-col">
            {doc.events
              .slice()
              .reverse()
              .map((event) => {
                const person = resolvePerson(event.userId);
                return (
                  <li key={`${event.at}:${event.text}`} className="flex gap-2.5">
                    <span className="flex flex-col items-center">
                      {person ? (
                        <PersonAvatar person={person} role="" size={20} />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-muted-foreground/40" aria-hidden />
                      )}
                      <span className="my-1 w-0.5 flex-1 rounded-full bg-border/60" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5 pb-3">
                      {/* Дія безособова («внесено номер»), тож ім'я — під нею, а не підметом: так не треба вгадувати рід. */}
                      <span className="text-sm leading-snug text-foreground first-letter:uppercase">{event.text}</span>
                      <span className="text-xs text-muted-foreground">
                        {person ? `${person.label} · ` : null}
                        <span className="figure">{formatMoment(event.at, event.precise)}</span>
                      </span>
                    </span>
                  </li>
                );
              })}
          </ol>
          <p className="text-xs text-muted-foreground">
            Тут лише те, що видно з полів документа. Повний журнал (хто що змінював і надсилав) з'явиться окремим кроком.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
