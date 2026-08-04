import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { FEATURE_DEFINITIONS, type FeatureDefinition, type FeatureKey } from "@/lib/featureCatalog";

/**
 * Онбординг однієї можливості — розкладка «розворот» (варіант Б, обраний CEO
 * 2026-08-04): ліворуч історія з нумерованими кроками, праворуч — вікно CRM,
 * усередині якого фіча ПРАЦЮЄ по-справжньому.
 *
 * НАВІЩО саме так: промо-модалка з кнопкою «перейти в налаштування» дала
 * 53 покази й 2 кліки (заміри по проду). Людина не хоче переходити кудись —
 * вона хоче натиснути й побачити результат, не втрачаючи контексту.
 */

const TELEGRAM_BOT_USERNAME = "ToShoCRM_bot";

/** Підпис у чромі вікна — щоб було видно, ДЕ в CRM ця фіча живе. */
const WINDOW_LABEL: Record<FeatureKey, string> = {
  telegram_bot: "профіль · сповіщення",
  voice_dictation: "дизайн-задача",
  task_chat: "обговорення",
};

const FIELD_LABEL: Record<FeatureKey, string> = {
  telegram_bot: "Telegram",
  voice_dictation: "Технічне завдання",
  task_chat: "Обговорення",
};

type Props = {
  feature: FeatureDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeatureOnboardingDialog({ feature, open, onOpenChange }: Props) {
  const navigate = useNavigate();

  const ordinal = useMemo(() => {
    if (!feature) return "01";
    const index = FEATURE_DEFINITIONS.findIndex((item) => item.key === feature.key);
    return String(Math.max(index, 0) + 1).padStart(2, "0");
  }, [feature]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0">
        {feature ? (
          <div className="grid md:grid-cols-[1fr_1.02fr]">
            {/* ── Ліворуч: історія ── */}
            <div className="flex flex-col p-7 sm:p-8">
              <div className="mb-4 flex items-baseline gap-2.5">
                <span className="font-mono text-2xl font-light tracking-tight tabular-nums">
                  {ordinal}
                </span>
                <span className="font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground">
                  можливість
                </span>
              </div>

              <DialogTitle className="text-3xl font-semibold leading-tight tracking-tight">
                {feature.label}
              </DialogTitle>

              <DialogDescription className="mt-3 text-sm leading-7 text-muted-foreground">
                {feature.summary}
              </DialogDescription>

              <ol className="mt-6 border-t border-border">
                {feature.steps.map((step, index) => (
                  <li
                    key={step}
                    className="grid grid-cols-[2rem_1fr] items-baseline gap-3 border-b border-border py-3 text-sm leading-6"
                  >
                    <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-auto flex items-center gap-3 pt-7">
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
                <span className="flex-1" />
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Закрити
                </Button>
              </div>
            </div>

            {/* ── Праворуч: вікно, у якому фіча працює ── */}
            <div className="relative grid place-items-center border-t border-border bg-muted/40 p-6 md:border-l md:border-t-0 md:p-7">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(hsl(var(--foreground) / 0.06) 1px, transparent 1px)",
                  backgroundSize: "15px 15px",
                }}
              />
              <div className="relative w-full max-w-[360px] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-border" />
                  <span className="h-2 w-2 rounded-full bg-border" />
                  <span className="h-2 w-2 rounded-full bg-border" />
                  <span className="ml-1.5 font-mono text-3xs text-muted-foreground">
                    {WINDOW_LABEL[feature.key]}
                  </span>
                </div>
                <div className="grid gap-2.5 p-3.5">
                  <p className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {FIELD_LABEL[feature.key]}
                  </p>
                  <FeatureDemo featureKey={feature.key} />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
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
      <div className="flex items-center gap-2.5 rounded-lg border border-success-soft-border bg-success-soft px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-success-foreground">
          <Check className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-success-foreground">Бот підключений</p>
          <p className="truncate text-3xs text-success-foreground">
            {linked === "підключено" || linked.startsWith("@") ? linked : `@${linked}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      <p className="text-xs leading-5 text-muted-foreground">
        Тисни кнопку — відкриється бот @{TELEGRAM_BOT_USERNAME}. Там натисни <b>Start</b> і
        повертайся сюди.
      </p>
      <Button type="button" size="sm" onClick={connect} disabled={busy || !checked}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Відкрити бот
      </Button>
      {awaitingStart ? (
        <Button type="button" size="sm" variant="outline" onClick={check} disabled={busy}>
          Я натиснув Start — перевір
        </Button>
      ) : null}
    </div>
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
      <p className="text-xs leading-5 text-muted-foreground">
        Цей браузер не вміє записувати звук. Спробуй у Chrome або Safari на компʼютері.
      </p>
    );
  }

  return (
    <div className="grid gap-2.5">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Тут зʼявиться те, що ти надиктуєш…"
        className="min-h-[82px] resize-none text-xs leading-5"
        aria-label="Розшифрований текст"
      />

      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <Button type="button" size="sm" variant="destructive" onClick={stop}>
            <Square className="h-3 w-3" />
            Зупинити
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={start} disabled={transcribing}>
            {transcribing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            {transcribing ? "Розшифровую…" : "Записати"}
          </Button>
        )}

        {recording ? (
          <>
            <Waveform />
            <span className="font-mono text-3xs tabular-nums text-destructive">{timer}</span>
          </>
        ) : null}

        {text && !recording ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setText("")}>
            Очистити
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-3xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Смужки, що стрибають під час запису. Суто декоративна. */
function Waveform() {
  return (
    <span aria-hidden="true" className="flex h-4 items-center gap-[3px] text-destructive">
      {Array.from({ length: 10 }, (_, index) => (
        <span
          key={index}
          className="w-[3px] rounded-full bg-current motion-safe:animate-feature-wave"
          style={{ height: "30%", animationDelay: `${index * 0.08}s` }}
        />
      ))}
    </span>
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
    <div className="grid gap-2.5">
      <div className="grid max-h-[150px] gap-1.5 overflow-y-auto pr-1">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex items-start gap-1.5", message.author === "me" && "flex-row-reverse")}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-3xs font-bold",
                message.author === "me"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {message.author === "me" ? "Я" : "МС"}
            </span>
            <p
              className={cn(
                "max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs leading-5",
                message.author === "me" ? "bg-primary/10" : "bg-muted"
              )}
            >
              {message.text}
            </p>
          </div>
        ))}

        {typing ? (
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-3xs font-bold text-secondary-foreground">
              МС
            </span>
            <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
              друкує…
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex items-end gap-1.5">
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
          className="min-h-[36px] resize-none text-xs leading-5"
          rows={1}
          aria-label="Повідомлення"
        />
        <Button
          type="button"
          size="sm"
          onClick={send}
          disabled={!draft.trim()}
          aria-label="Надіслати"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="text-3xs leading-4 text-muted-foreground">
        Демо — повідомлення нікуди не йдуть.
      </p>
    </div>
  );
}
