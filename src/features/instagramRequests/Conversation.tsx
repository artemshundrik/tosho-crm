import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { ROUTES } from "@/layout/routes";
import { toneBadgeClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

import {
  clientName,
  composerBlockedReason,
  messageTime,
  requestBanner,
  safeAttachments,
  type BannerContext,
} from "./presentation";
import { RequestActionError, callRequests, requestKeys, type MessageRow, type RequestRow } from "./queries";
import { useQueryClient } from "@tanstack/react-query";
import { canClaim, canPass, type RequestActor } from "./rules";
import { OwnerMark, TestTag } from "./ui";

type Props = {
  request: RequestRow;
  messages: MessageRow[];
  actor: RequestActor;
  assignee: WorkspaceMemberDisplayRow | null;
  nameOf: (userId: string | null) => string | null;
  bannerContext: Omit<BannerContext, "actor" | "assigneeName">;
  now: Date;
  busy: boolean;
  onPass: () => void;
  onClaim: () => void;
  onShowDetails: () => void;
  className?: string;
};

/** Функцію могли вбити посеред надсилання: «надсилається» понад 2 хвилини вже неправда. */
const isUndelivered = (message: MessageRow, now: Date) =>
  message.send_status === "failed" || (message.send_status === "pending" && now.getTime() - new Date(message.created_at).getTime() > 120_000);

function bubbleFor(message: MessageRow, actorId: string, nameOf: (userId: string | null) => string | null, now: Date) {
  const time = messageTime(message.created_at, now);
  if (message.direction === "in") return { own: false, tint: "border-border bg-card", meta: `Клієнт, ${time}` };
  if (message.source === "auto_reply" && isUndelivered(message, now)) {
    return { own: true, tint: "border-transparent " + toneBadgeClass.danger, meta: "Автовідповідь не надіслана" };
  }
  if (isUndelivered(message, now)) {
    return { own: true, tint: "border-transparent " + toneBadgeClass.danger, meta: "Не надіслано. Натисніть, щоб повторити" };
  }
  if (message.send_status === "pending") return { own: true, tint: "border-border bg-primary/10", meta: "Надсилається…" };
  if (message.source === "ig_app") return { own: true, tint: "border-border bg-muted", meta: `Із застосунку Instagram, ${time}` };
  if (message.source === "auto_reply") return { own: true, tint: "border-border bg-muted", meta: `Автовідповідь, ${time}` };
  const who = message.sender_user_id === actorId ? "Ви" : (nameOf(message.sender_user_id) ?? "Менеджер");
  return { own: true, tint: "border-primary/20 bg-primary/10", meta: `${who}, ${time}` };
}

export function Conversation({ request, messages, actor, assignee, nameOf, bannerContext, now, busy, onPass, onClaim, onShowDetails, className }: Props) {
  const client = useQueryClient();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  // Один ключ на один текст: повторне натискання після обриву зв'язку не дасть другого повідомлення клієнту.
  const clientMessageIdRef = React.useRef(crypto.randomUUID());
  const [retrying, setRetrying] = React.useState<string | null>(null);

  const mine = request.assigned_user_id === actor.userId;
  const banner = requestBanner(request, { ...bannerContext, actor, assigneeName: assignee?.label ?? null });
  const blocked = composerBlockedReason(request, actor, now, assignee?.label ?? null);
  const ownerLine = mine ? "Займаєтесь ви" : assignee ? `Займається ${assignee.label}` : "Ніхто не займається";

  React.useEffect(() => {
    setText("");
    clientMessageIdRef.current = crypto.randomUUID();
  }, [request.id]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, request.id]);

  const refresh = () => client.invalidateQueries({ queryKey: requestKeys.all });

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await callRequests({ action: "reply", requestId: request.id, clientMessageId: clientMessageIdRef.current, text: body });
      setText("");
      clientMessageIdRef.current = crypto.randomUUID();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося надіслати");
      // Сервер уже записав його як не надіслане: воно видно в розмові з кнопкою повтору.
      if (error instanceof RequestActionError && error.messageId) {
        setText("");
        clientMessageIdRef.current = crypto.randomUUID();
      }
    } finally {
      setSending(false);
      void refresh();
    }
  };

  const retry = async (messageId: string) => {
    setRetrying(messageId);
    try {
      await callRequests({ action: "retry", requestId: request.id, messageId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося надіслати");
    } finally {
      setRetrying(null);
      void refresh();
    }
  };

  return (
    <section aria-label="Розмова" className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-card px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-col">
          <Link to={ROUTES.requests} className="mb-0.5 text-xs text-primary md:hidden">
            Усі заявки
          </Link>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{clientName(request)}</span>
            {request.is_test ? <TestTag /> : null}
          </span>
          <span className="text-xs text-muted-foreground">
            {request.kind === "other" ? "Написали не з реклами" : request.ad_title ? `Прийшла з реклами «${request.ad_title}»` : "Прийшла з реклами"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {request.kind === "ad" ? (
            <span className="flex items-center gap-1.5 font-semibold">
              {assignee ? <OwnerMark member={assignee} isMe={mine} size={22} /> : null}
              <span className="sr-only">{ownerLine}</span>
            </span>
          ) : null}
          {canPass(actor, request) ? (
            <Button variant="outline" size="md" onClick={onPass}>
              Передати
            </Button>
          ) : null}
          {canClaim(actor, request) ? (
            <Button size="md" disabled={busy} onClick={onClaim}>
              Забрати собі
            </Button>
          ) : null}
          <Button variant="outline" size="md" className="xl:hidden" onClick={onShowDetails}>
            Дані
          </Button>
        </div>
      </header>

      <div className={cn("px-4 py-2 text-md md:px-5", toneBadgeClass[banner.tone])} role="status">
        {banner.text}
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain p-4 md:p-5">
        {messages.map((message) => {
          const bubble = bubbleFor(message, actor.userId, nameOf, now);
          const attachments = safeAttachments(message.attachments);
          const failed = isUndelivered(message, now);
          const canRetry = failed && mine && message.source !== "auto_reply";
          const content = (
            <>
              {message.body ? <span className="whitespace-pre-wrap break-words">{message.body}</span> : null}
              {attachments.map((file) =>
                file.isImage ? (
                  <a key={file.url} href={file.url} target="_blank" rel="noreferrer noopener" className="mt-1 block">
                    <img src={file.url} alt={file.name} loading="lazy" className="max-h-60 rounded-lg" />
                  </a>
                ) : (
                  <a key={file.url} href={file.url} target="_blank" rel="noreferrer noopener" className="mt-1 block text-primary underline">
                    {file.name}
                  </a>
                )
              )}
            </>
          );
          return (
            <div key={message.id} className={cn("flex max-w-[85%] flex-col gap-0.5 md:max-w-[70%]", bubble.own ? "items-end self-end" : "items-start self-start")}>
              {canRetry ? (
                <button
                  type="button"
                  disabled={retrying === message.id}
                  onClick={() => void retry(message.id)}
                  className={cn("rounded-xl border px-3 py-2 text-left text-md", bubble.tint)}
                >
                  {content}
                </button>
              ) : (
                <div className={cn("rounded-xl border px-3 py-2 text-md", bubble.tint)}>{content}</div>
              )}
              <span className={cn("text-2xs", failed ? "text-danger-foreground" : "text-muted-foreground")}>{failed && !mine ? "Не надіслано" : bubble.meta}</span>
            </div>
          );
        })}
      </div>

      <div className="px-4 pb-4 md:px-5 md:pb-5">
        {blocked ? (
          <div className="rounded-xl bg-muted p-3 text-md text-muted-foreground">{blocked}</div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
            <label htmlFor="request-reply" className="text-xs text-muted-foreground">
              Відповідь клієнту в Direct
            </label>
            <AutoTextarea
              id="request-reply"
              value={text}
              maxLength={1000}
              onChange={(event) => setText(event.target.value)}
              placeholder="Напишіть клієнту"
              className="min-h-10 resize-none border-0 bg-transparent p-0 text-md shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex justify-end">
              <Button size="md" disabled={!text.trim()} loading={sending} onClick={() => void send()}>
                Надіслати
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
