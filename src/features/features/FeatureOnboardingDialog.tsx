import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, Mic, Send, Square } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { useDictation } from "@/lib/useDictation";
import type { FeatureDefinition, FeatureKey } from "@/lib/featureCatalog";

/**
 * Онбординг однієї можливості: фічу видно й можна спробувати ПРЯМО ТУТ,
 * не йдучи в дизайн-задачу чи профіль.
 *
 * НАВІЩО саме так: промо-модалка з кнопкою «перейти в налаштування» дала
 * 53 покази й 2 кліки (заміри по проду 2026-08-04). Людина не хоче
 * переходити кудись — вона хоче натиснути й побачити результат.
 */

const TELEGRAM_BOT_USERNAME = "ToShoCRM_bot";

type Props = {
  feature: FeatureDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeatureOnboardingDialog({ feature, open, onOpenChange }: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0">
        {feature ? (
          <>
            <div className="border-b border-border px-6 pb-4 pt-6">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {feature.label}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {feature.summary}
              </DialogDescription>
            </div>

            <div className="bg-muted/40 px-6 py-5">
              <FeatureDemo featureKey={feature.key} />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  navigate(feature.route);
                }}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Відкрити у CRM →
              </button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Закрити
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Обгортка демо: підпис + «стенд», на якому живе інтерактив. */
function DemoStage({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{hint}</p>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">{children}</div>
    </div>
  );
}

function FeatureDemo({ featureKey }: { featureKey: FeatureKey }) {
  if (featureKey === "telegram_bot") return <TelegramDemo />;
  if (featureKey === "voice_dictation") return <DictationDemo />;
  return <TaskChatDemo />;
}

/* ── Telegram: справжнє підключення просто звідси ──────────────── */

function TelegramDemo() {
  const { userId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState<string | null>(null);
  const [awaitingStart, setAwaitingStart] = useState(false);
  const [checked, setChecked] = useState(false);

  const readSettings = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .schema("tosho")
      .from("user_notification_settings")
      .select("telegram_chat_id,telegram_username")
      .eq("user_id", userId)
      .maybeSingle();
    return data ?? null;
  }, [userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await readSettings();
      if (!active) return;
      setChecked(true);
      if (data?.telegram_chat_id) setLinked(data.telegram_username ?? "підключено");
    })();
    return () => {
      active = false;
    };
  }, [readSettings]);

  const connect = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const nonce = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error } = await supabase
        .schema("tosho")
        .from("telegram_link_tokens")
        .insert({ nonce, user_id: userId, expires_at: expiresAt });
      if (error) throw error;
      window.open(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${nonce}`, "_blank", "noopener");
      setAwaitingStart(true);
    } catch {
      toast.error("Не вдалося створити посилання. Спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    try {
      const data = await readSettings();
      if (data?.telegram_chat_id) {
        setLinked(data.telegram_username ?? "підключено");
        setAwaitingStart(false);
        toast.success("Telegram підключено.");
      } else {
        toast.message("Ще не бачу підключення. Натисни Start у боті й перевір ще раз.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (linked) {
    return (
      <DemoStage hint="Стан підключення">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-foreground">
            <Check className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Бот уже підключений</p>
            <p className="truncate text-xs text-muted-foreground">
              {linked.startsWith("@") || linked === "підключено" ? linked : `@${linked}`} — сповіщення
              приходять у Telegram
            </p>
          </div>
        </div>
      </DemoStage>
    );
  }

  return (
    <DemoStage hint="Спробуй просто зараз">
      <div className="grid gap-3">
        <p className="text-sm leading-6 text-muted-foreground">
          Натисни кнопку — відкриється бот @{TELEGRAM_BOT_USERNAME}. Тисни там <b>Start</b>,
          повертайся сюди й перевір. Нічого налаштовувати не треба.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={connect} disabled={busy || !checked}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Відкрити бот і підключити
          </Button>
          {awaitingStart ? (
            <Button type="button" variant="outline" onClick={check} disabled={busy}>
              Я натиснув Start — перевір
            </Button>
          ) : null}
        </div>
      </div>
    </DemoStage>
  );
}

/* ── Диктування: справжній запис і розшифровка тут же ──────────── */

function DictationDemo() {
  const [text, setText] = useState("");
  const { state, elapsedMs, error, isSupported, start, stop, cancel } = useDictation({
    context: "brief",
    onResult: (value) => setText((prev) => (prev ? `${prev} ${value}` : value)),
  });

  useEffect(() => () => cancel(), [cancel]);

  const seconds = Math.floor(elapsedMs / 1000);
  const timer = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const recording = state === "recording";
  const transcribing = state === "transcribing";

  if (!isSupported) {
    return (
      <DemoStage hint="Спробуй просто зараз">
        <p className="text-sm text-muted-foreground">
          Цей браузер не вміє записувати звук. Спробуй у Chrome або Safari на компʼютері.
        </p>
      </DemoStage>
    );
  }

  return (
    <DemoStage hint="Спробуй просто зараз — скажи щось уголос">
      <div className="grid gap-3">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Тут зʼявиться те, що ти надиктуєш…"
          className="min-h-[92px] resize-none text-sm"
          aria-label="Розшифрований текст"
        />

        <div className="flex flex-wrap items-center gap-2">
          {recording ? (
            <Button type="button" variant="destructive" onClick={stop}>
              <Square className="h-3.5 w-3.5" />
              Зупинити · {timer}
            </Button>
          ) : (
            <Button type="button" onClick={start} disabled={transcribing}>
              {transcribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              {transcribing ? "Розшифровую…" : "Записати"}
            </Button>
          )}

          {recording ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
              Запис іде
            </span>
          ) : null}

          {text ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setText("")}>
              Очистити
            </Button>
          ) : null}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <p className="text-xs leading-5 text-muted-foreground">
          Так само працює мікрофон у полі «Технічне завдання» й у коментарях до задачі.
        </p>
      </div>
    </DemoStage>
  );
}

/* ── Обговорення в задачі: показова гілка з відповіддю ──────────── */

type DemoMessage = { id: number; author: "me" | "mate"; text: string };

const MATE_REPLIES = [
  "Прийняв. Візьму в роботу після поточної правки.",
  "Ок, тоді роблю без тіні й скидаю на погодження.",
  "Зрозумів. Якщо клієнт попросить ще варіант — пиши сюди ж.",
];

const SEED: DemoMessage[] = [
  { id: 1, author: "mate", text: "Клієнт просить логотип більший і без тіні. Встигнемо сьогодні?" },
];

function TaskChatDemo() {
  const [messages, setMessages] = useState<DemoMessage[]>(SEED);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const replyIndex = useRef(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    []
  );

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setMessages((prev) => [...prev, { id: prev.length + 1, author: "me", text: body }]);
    setDraft("");
    setTyping(true);

    const timer = setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          author: "mate",
          text: MATE_REPLIES[replyIndex.current % MATE_REPLIES.length],
        },
      ]);
      replyIndex.current += 1;
    }, 1100);
    timers.current.push(timer);
  };

  return (
    <DemoStage hint="Показова гілка — напиши щось, колега відповість">
      <div className="grid gap-3">
        <div className="grid max-h-[188px] gap-2 overflow-y-auto pr-1">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex items-start gap-2",
                message.author === "me" && "flex-row-reverse"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-3xs font-bold text-primary-foreground",
                  message.author === "me" ? "bg-primary" : "bg-secondary"
                )}
              >
                {message.author === "me" ? "Я" : "МС"}
              </span>
              <p
                className={cn(
                  "max-w-[78%] rounded-xl px-3 py-2 text-sm leading-6",
                  message.author === "me"
                    ? "bg-primary/10 text-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                {message.text}
              </p>
            </div>
          ))}

          {typing ? (
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-3xs font-bold text-primary-foreground">
                МС
              </span>
              <span className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                друкує…
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Напиши повідомлення…"
            className="min-h-[40px] resize-none text-sm"
            rows={1}
            aria-label="Повідомлення"
          />
          <Button type="button" onClick={send} disabled={!draft.trim()} aria-label="Надіслати">
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Це демо — справжні повідомлення нікуди не йдуть. У задачі такий самий чат стоїть у правій
          колонці, а згадка людини надсилає їй сповіщення.
        </p>
      </div>
    </DemoStage>
  );
}
