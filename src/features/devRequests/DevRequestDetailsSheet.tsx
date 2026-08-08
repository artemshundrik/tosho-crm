import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  ChevronsUp,
  FileText,
  History,
  Inbox,
  PencilLine,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TaskThreadRail } from "@/features/taskChat/TaskThreadRail";
import { moduleKeyLabel } from "@/lib/projectMap";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { MODULE_UNSET_LABEL, resolveAuthor } from "./cardModel";
import { auditActionLabel, auditChangeLines } from "./history";
import { useDevRequestHistory } from "./queries";
import { KIND_ICONS, KIND_LABELS, KIND_TONE, PRIORITY_LABELS, type DevRequest } from "./types";

/**
 * Подій activity_log у запитів немає — історію полів пише аудит-тригер, і вона
 * показана окремою секцією нижче. Порожній список означає «стрічка лише з
 * повідомлень», і панель тоді в activity_log не ходить взагалі.
 *
 * Стала на рівні модуля, а не літерал у JSX: інакше кожен рендер створював би
 * новий масив і панель перезапитувала б стрічку.
 */
const NO_THREAD_EVENTS: string[] = [];

function formatWhen(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Рядок «поле — значення» в картці-довідці. */
function DetailRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-[13px]" title={hint}>
        {children}
      </span>
    </div>
  );
}

function DetailCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border/50 bg-muted/10 px-3 py-0.5">
      {children}
    </div>
  );
}

type DevRequestDetailsSheetProps = {
  /** Відкрита картка. null — дровер закритий. */
  request: DevRequest | null;
  onClose: () => void;
  onEdit: (request: DevRequest) => void;
  onDelete: (request: DevRequest) => void;
  canManage: boolean;
};

/**
 * Деталі запиту — дровер справа НАКЛАДКОЮ.
 *
 * Чому накладка, а не колонка: дошка прокручується горизонтально, і постійна
 * колонка з'їдала б їй ширину саме тоді, коли картку читають. Попередній
 * варіант був колонкою — і, крім ширини, мав більшу ваду: у ньому було ЛИШЕ
 * обговорення, тож повний текст запиту не було видно ніде, окрім вікна
 * «Редагувати». Читати опис доводилось із режиму правки — за крок від того,
 * щоб випадково змінити чужу картку.
 *
 * Порядок секцій — від «що просять» до «хто це обговорював»: суть, як
 * класифіковано, звідки прийшло, що з карткою робили, і аж потім розмова.
 */
export function DevRequestDetailsSheet({
  request,
  onClose,
  onEdit,
  onDelete,
  canManage,
}: DevRequestDetailsSheetProps) {
  const { userId } = useAuth();

  /**
   * Остання показана картка. Дровер їде назовні з анімацією, а `request` на
   * той момент уже null — без цієї копії вміст блимав би порожнечею, а Radix
   * лишався б без заголовка, якого вимагає для доступності.
   */
  const [shown, setShown] = useState<DevRequest | null>(request);
  useEffect(() => {
    if (request) setShown(request);
  }, [request]);

  const historyQuery = useDevRequestHistory(request, userId);
  // Немає прав або RPC відмовила — секції просто немає. Історія тут довідка,
  // а не суть: валити через неї дровер (і ховати обговорення) немає за що.
  const historyEntries = historyQuery.data ?? [];

  const author = shown ? resolveAuthor(shown) : null;
  const KindIcon = shown ? KIND_ICONS[shown.kind] : null;
  const moduleLabel = shown ? moduleKeyLabel(shown.moduleKey) : null;

  return (
    <Sheet
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* isDirty={false} навмисно: дровер лише показує картку, форми в ньому
          немає. Без цього автозахист «незбережених змін» рахував би зміною
          будь-яке натискання (він ловить усі кнопки) — і питав би «закрити без
          збереження?» після кожного перегляду. */}
      <SheetContent className="w-full gap-0 p-0 sm:max-w-[560px]" isDirty={false}>
        {shown ? (
          <>
            <div className="shrink-0 border-b bg-muted/20 px-5 py-4 pr-14">
              <SheetHeader className="space-y-1">
                <span className="font-mono text-2xs font-semibold tracking-wide text-muted-foreground">
                  {shown.label}
                </span>
                <SheetTitle className="text-base font-medium leading-snug">
                  {shown.title}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Повний текст запиту, класифікація, історія змін і обговорення
                </SheetDescription>
              </SheetHeader>

              {canManage ? (
                // Обробники ті самі, що й у меню картки, — сторінка передає
                // свої. Другої логіки правки/видалення тут немає навмисно.
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onEdit(shown)}>
                    <PencilLine className="h-4 w-4" />
                    Редагувати
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(shown)}>
                    <Trash2 className="h-4 w-4" />
                    Видалити
                  </Button>
                </div>
              ) : null}
            </div>

            <SheetBody className="space-y-5 px-5 py-5">
              <Section title="Суть" icon={FileText}>
                {shown.body.trim() ? (
                  // whitespace-pre-wrap: надиктований текст приходить абзацами,
                  // і без цього вони склеювались би в суцільну стіну.
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{shown.body}</p>
                ) : (
                  <p className="text-[13px] text-muted-foreground">опису немає</p>
                )}
              </Section>

              <Section title="Класифікація" icon={Tags}>
                <DetailCard>
                  <DetailRow label="Тип">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 font-medium",
                        toneTextClass[KIND_TONE[shown.kind]]
                      )}
                    >
                      {KindIcon ? <KindIcon className="h-3.5 w-3.5" /> : null}
                      {KIND_LABELS[shown.kind]}
                    </span>
                  </DetailRow>
                  <DetailRow label="Напрямок">
                    {moduleLabel ?? (
                      <span className="text-muted-foreground">{MODULE_UNSET_LABEL}</span>
                    )}
                  </DetailRow>
                  {/* На картці «звичайний» не підписується взагалі, а тут —
                      підписується: це відповідь на пряме питання «який
                      пріоритет», а не мітка в ряду, який сканують очима. */}
                  <DetailRow label="Пріоритет">
                    {shown.priority === "high" ? (
                      <Badge tone="danger" className="h-5 gap-1 px-2 text-2xs">
                        <ChevronsUp className="h-3 w-3" />
                        {PRIORITY_LABELS.high}
                      </Badge>
                    ) : shown.priority ? (
                      <span className={shown.priority === "normal" ? "text-muted-foreground" : ""}>
                        {PRIORITY_LABELS[shown.priority]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">не проставлено</span>
                    )}
                  </DetailRow>
                </DetailCard>

                {shown.autoClassified ? (
                  <p className="flex items-start gap-1.5 text-2xs text-muted-foreground/80">
                    <Sparkles className="mt-px h-3 w-3 shrink-0" />
                    поставив агент, не підтверджено
                  </p>
                ) : null}
              </Section>

              <Section title="Звідки прийшло" icon={Inbox}>
                <DetailCard>
                  <DetailRow label="Автор" hint={author?.hint}>
                    {author?.label ?? <span className="text-muted-foreground">з дошки</span>}
                  </DetailRow>
                  <DetailRow label="Просили" hint="Стільки людей просили те саме">
                    {shown.askedByCount}
                  </DetailRow>
                  <DetailRow label="Створено">{formatWhen(shown.createdAt)}</DetailRow>
                </DetailCard>
              </Section>

              {historyEntries.length > 0 ? (
                <Section title="Історія змін" icon={History}>
                  <ul className="space-y-2.5">
                    {historyEntries.map((entry) => {
                      const lines = auditChangeLines(entry);
                      return (
                        <li
                          key={entry.id}
                          className="border-b border-border/40 pb-2.5 last:border-0 last:pb-0"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            {/* Без actor_user_id запис зробила не людина, а
                                сервер: картки з Telegram і Cowork створює
                                функція під сервісним ключем. */}
                            <span className="text-xs font-medium">
                              {entry.actorName ?? (entry.actorUserId ? "Учасник" : "Автоматично")}
                            </span>
                            <span className="shrink-0 text-2xs text-muted-foreground">
                              {formatWhen(entry.createdAt)}
                            </span>
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {lines.length === 0 ? (
                              <p className="text-2xs text-muted-foreground">
                                {auditActionLabel(entry.action)}
                              </p>
                            ) : (
                              lines.map((line) => (
                                <p key={line.field} className="text-2xs text-muted-foreground">
                                  <span className="text-foreground">{line.label}:</span>{" "}
                                  <span className="line-through opacity-70">{line.from}</span>
                                  {" → "}
                                  <span className="text-foreground">{line.to}</span>
                                </p>
                              ))
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              ) : null}

              {/* Обговорення останнім: свій заголовок панель малює сама, тож
                  секцію тут не обгортаємо. Висота задається зовні — сама
                  панель тягнеться під батька (h-full flex-1), а всередині
                  прокручується стрічка. */}
              <div className="flex h-[420px] min-h-0 flex-col">
                <TaskThreadRail
                  threadKey={`dev-request:${shown.id}`}
                  eventActions={NO_THREAD_EVENTS}
                  quoteId={null}
                  teamId={shown.teamId}
                />
              </div>
            </SheetBody>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
