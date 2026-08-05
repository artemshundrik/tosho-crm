import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Loader2, MessageCircleQuestion, Mic, RefreshCw, Search, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AvatarBase } from "@/components/app/avatar-kit";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { useDictation } from "@/lib/useDictation";
import { FeaturePreview } from "@/features/features/FeaturePreview";
import { ASSISTANT_TOPICS, BOT_COMMANDS } from "@/features/features/featureDemoContent";
import { visibleNotificationCategories } from "@/lib/notificationCategories";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { CommandPalette } from "@/components/app/CommandPalette";
import { FEATURE_DEFINITIONS, type FeatureDefinition, type FeatureKey } from "@/lib/featureCatalog";

/**
 * Онбординг однієї можливості — розкладка «розворот» (варіант Б, обраний CEO
 * 2026-08-04): ліворуч історія з нумерованими кроками, праворуч — вікно CRM,
 * усередині якого фіча ПРАЦЮЄ по-справжньому.
 *
 * ВАЖЛИВО ПРО СТИЛІ: бульбашки, композер і еквалайзер запису тут — НЕ власні.
 * Це ті самі класи, що в справжньому чаті задачі (features/taskChat/ThreadFeed
 * і ThreadComposer). Своя версія виглядала «криво» саме тому, що розходилась
 * із продуманим оригіналом. Міняєш чат — звіряй і це.
 *
 * НАВІЩО взагалі: промо-модалка з кнопкою «перейти в налаштування» дала
 * 53 покази й 2 кліки (заміри по проду). Людина не хоче переходити кудись —
 * вона хоче натиснути й побачити результат, не втрачаючи контексту.
 */

const TELEGRAM_BOT_USERNAME = "ToShoCRM_bot";

/** Підпис у чромі вікна — щоб було видно, ДЕ в CRM ця фіча живе. */
const WINDOW_LABEL: Record<FeatureKey, string> = {
  telegram_bot: "профіль · сповіщення",
  voice_dictation: "дизайн-задача",
  task_chat: "обговорення",
  support_ai: "помічник",
  absence_request: "команда · відсутності",
  command_palette: "швидкий перехід",
  nova_poshta_address: "картка замовника",
  dropbox_folders: "замовники · файли",
  telegram_assistant: "telegram",
};

/** Смужки еквалайзера — копія з ThreadComposer, щоб запис виглядав однаково. */
const WAVE_BARS = [
  { height: 8, delay: "0ms" },
  { height: 14, delay: "120ms" },
  { height: 10, delay: "240ms" },
  { height: 16, delay: "80ms" },
  { height: 9, delay: "300ms" },
  { height: 13, delay: "180ms" },
  { height: 7, delay: "60ms" },
];

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
              {LIVE_DEMO_KEYS.includes(feature.key) ? (
                <div className="relative w-full max-w-[360px] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/60 px-3 py-2">
                    <span className="h-2 w-2 rounded-full bg-border" />
                    <span className="h-2 w-2 rounded-full bg-border" />
                    <span className="h-2 w-2 rounded-full bg-border" />
                    <span className="ml-1.5 font-mono text-3xs text-muted-foreground">
                      {WINDOW_LABEL[feature.key]}
                    </span>
                  </div>
                  <FeatureDemo featureKey={feature.key} />
                </div>
              ) : (
                <div className="relative w-full max-w-[360px]">
                  <FeaturePreview featureKey={feature.key} />
                  <p className="mt-2.5 text-center text-3xs text-muted-foreground">
                    Ця можливість живе не у вікні — тисни «Відкрити у CRM».
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Демо є майже в кожної можливості, і всюди, де це можливо, воно працює на
 * СПРАВЖНІХ компонентах CRM — а не на намальованій імітації:
 *   • адреси — той самий `AddressAutocomplete`, що в картці замовника,
 *     із живими запитами до довідника Нової Пошти;
 *   • ⌘K — та сама `CommandPalette`, що й глобальна;
 *   • підтримка — справжня консоль помічника через URL-намір `?tosho_ai=open`.
 *
 * Виняток — Telegram: він живе поза браузером, тож там показуємо не імітацію
 * чату, а справжній перелік того, що бот уміє (див. featureDemoContent.ts).
 */
const LIVE_DEMO_KEYS: FeatureKey[] = [
  "telegram_bot",
  "voice_dictation",
  "task_chat",
  "support_ai",
  "command_palette",
  "nova_poshta_address",
  "telegram_assistant",
];

function FeatureDemo({ featureKey }: { featureKey: FeatureKey }) {
  if (featureKey === "telegram_bot") return <TelegramDemo />;
  if (featureKey === "voice_dictation") return <DictationDemo />;
  if (featureKey === "task_chat") return <TaskChatDemo />;
  if (featureKey === "support_ai") return <SupportDemo />;
  if (featureKey === "command_palette") return <PaletteDemo />;
  if (featureKey === "nova_poshta_address") return <AddressDemo />;
  if (featureKey === "telegram_assistant") return <AssistantDemo />;
  return null;
}

/* ── Підтримка: відкриваємо СПРАВЖНЮ консоль помічника ─────────── */

function SupportDemo() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="grid gap-2.5 p-3.5">
      <p className="text-xs leading-5 text-muted-foreground">
        Помічник бачить сторінку, з якої ти його відкрив, тож питання можна ставити
        своїми словами — «чому не зберігається», «де знайти».
      </p>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          // Той самий URL-намір, яким консоль відкривається звідусіль у CRM.
          const params = new URLSearchParams(location.search);
          params.set("tosho_ai", "open");
          navigate(`${location.pathname}?${params.toString()}`);
        }}
      >
        <MessageCircleQuestion className="h-3.5 w-3.5" />
        Відкрити помічника
      </Button>
      <p className="text-3xs leading-4 text-muted-foreground">
        Якщо відповіді забракне — заявка піде далі, і рішення прийде сповіщенням.
      </p>
    </div>
  );
}

/* ── ⌘K: відкриваємо ту саму глобальну палітру ─────────────────── */

function PaletteDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-2.5 p-3.5">
      <p className="text-xs leading-5 text-muted-foreground">
        Це та сама палітра, що й по ⌘K будь-де в CRM. Спробуй набрати назву замовника
        або номер прорахунку.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Search className="h-3.5 w-3.5" />
        Відкрити пошук
        <kbd className="ml-1 rounded border border-border px-1 font-mono text-3xs">⌘K</kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}

/* ── Адреси: справжній автокомпліт Нової Пошти ─────────────────── */

function AddressDemo() {
  const [value, setValue] = useState("");

  return (
    <div className="grid gap-2.5 p-3.5">
      <p className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
        Точка доставки
      </p>
      {/* Той самий компонент, що в картці замовника: запити йдуть у справжній
          довідник перевізника. Читання, тож нічого не змінює. */}
      <AddressAutocomplete
        value={value}
        onChange={setValue}
        placeholder="Почни вводити місто…"
        className="text-xs"
      />
      <p className="text-3xs leading-4 text-muted-foreground">
        Підказки живі — це справжній довідник Нової Пошти. Спробуй «Киї» або «Львів».
      </p>
    </div>
  );
}

/* ── Помічник у Telegram: справжній перелік можливостей ────────── */

function AssistantDemo() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (question: string) => {
    try {
      await navigator.clipboard.writeText(question);
      setCopied(question);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.message("Не вдалося скопіювати — виділи текст вручну.");
    }
  };

  return (
    <div className="grid gap-2 p-3.5">
      <p className="text-3xs leading-4 text-muted-foreground">
        Питання, які бот розуміє. Тисни, щоб скопіювати й вставити в чат.
      </p>
      <div className="grid max-h-[260px] gap-2.5 overflow-y-auto pr-1">
        {ASSISTANT_TOPICS.map((topic) => (
          <div key={topic.title} className="grid gap-1">
            <p className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
              {topic.title}
            </p>
            <div className="flex flex-wrap gap-1">
              {topic.questions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void copy(question)}
                  className="cursor-pointer rounded-full border border-border bg-card px-2 py-0.5 text-3xs transition-colors hover:border-foreground/25"
                >
                  {copied === question ? "скопійовано" : question}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Telegram: справжнє підключення просто звідси ──────────────── */

function TelegramDemo() {
  const { userId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState<string | null>(null);
  const [awaitingStart, setAwaitingStart] = useState(false);
  const [checked, setChecked] = useState(false);
  const [relinking, setRelinking] = useState(false);

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
        setRelinking(false);
        toast.success("Telegram підключено.");
      } else {
        toast.message("Ще не бачу підключення. Натисни Start у боті й перевір ще раз.");
      }
    } finally {
      setBusy(false);
    }
  };

  // Уже підключено — показуємо стан, але лишаємо шлях пройти підключення ще раз.
  // Без цього людина з підключеним ботом не може перевірити, чи воно взагалі працює.
  if (linked && !relinking) {
    return (
      <div className="grid gap-2.5 p-3.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-success-soft-border bg-success-soft px-3 py-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-card text-success-foreground">
            <Check className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-success-foreground">Бот підключений</p>
            <p className="truncate text-3xs text-success-foreground">
              {linked === "підключено" || linked.startsWith("@") ? linked : `@${linked}`}
            </p>
          </div>
        </div>

        <BotCapabilities />

        <button
          type="button"
          onClick={() => setRelinking(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 justify-self-start text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Підключити заново
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-2.5 p-3.5">
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
      {relinking ? (
        <button
          type="button"
          onClick={() => {
            setRelinking(false);
            setAwaitingStart(false);
          }}
          className="cursor-pointer justify-self-start text-2xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Скасувати
        </button>
      ) : (
        <BotCapabilities />
      )}
    </div>
  );
}

/**
 * Що саме бот уміє — з реальних реєстрів, а не з опису «по памʼяті»:
 * категорії беремо з notificationCategories.ts (звужені під роль так само,
 * як у налаштуваннях), команди — з featureDemoContent.ts.
 */
function BotCapabilities() {
  const { accessRole, jobRole } = useAuth();

  const categories = useMemo(
    () => visibleNotificationCategories({ accessRole, jobRole }),
    [accessRole, jobRole]
  );

  return (
    <div className="grid gap-2 border-t border-border pt-2.5">
      <p className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
        Про що напише ({categories.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {categories.map((category) => (
          <span
            key={category.key}
            title={category.description}
            className="rounded-full border border-border bg-card px-2 py-0.5 text-3xs text-muted-foreground"
          >
            {category.label}
          </span>
        ))}
      </div>

      <p className="mt-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
        Команди в чаті
      </p>
      <dl className="grid gap-0.5">
        {BOT_COMMANDS.map((item) => (
          <div key={item.command} className="flex gap-1.5 text-3xs leading-4">
            <dt className="shrink-0 font-mono font-semibold text-primary">{item.command}</dt>
            <dd className="min-w-0 text-muted-foreground">— {item.what}</dd>
          </div>
        ))}
      </dl>

      <p className="text-3xs leading-4 text-muted-foreground">
        Нічні сповіщення притримуються: бот пише лише з 9:00 до 21:00.
      </p>
    </div>
  );
}

/* ── Диктування: справжній запис, вигляд — як у композері чату ──── */

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
      <p className="p-3.5 text-xs leading-5 text-muted-foreground">
        Цей браузер не вміє записувати звук. Спробуй у Chrome або Safari на компʼютері.
      </p>
    );
  }

  return (
    <div className="grid gap-2.5 p-3.5">
      <p className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
        Технічне завдання
      </p>

      <div className="min-h-[82px] rounded-xl border border-border/60 bg-card p-2.5 text-xs leading-snug">
        {text ? (
          <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</span>
        ) : (
          <span className="text-muted-foreground">Тут зʼявиться те, що ти надиктуєш…</span>
        )}
      </div>

      {/* Смуга запису — той самий вигляд, що в композері чату. */}
      {recording || transcribing ? (
        <div className="flex min-h-[38px] items-center gap-1.5 rounded-[20px] border border-destructive/40 bg-card p-1 pl-2.5">
          {recording ? (
            <>
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />
              <span className="shrink-0 text-xs font-semibold tabular-nums text-destructive">
                {timer}
              </span>
              <span className="flex flex-1 items-center gap-[3px] px-1" aria-hidden="true">
                {WAVE_BARS.map((bar, index) => (
                  <span
                    key={index}
                    className="w-[3px] rounded-full bg-destructive/45 motion-safe:animate-[thread-wave_1.1s_ease-in-out_infinite]"
                    style={{ height: bar.height, animationDelay: bar.delay }}
                  />
                ))}
              </span>
              <button
                type="button"
                aria-label="Завершити запис"
                onClick={stop}
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Check className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              <span className="flex-1 text-xs text-muted-foreground">Розпізнаю голос…</span>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-[38px] items-center gap-1 rounded-[20px] border border-border/60 bg-card p-1 pl-1.5">
          <button
            type="button"
            aria-label="Продиктувати голосом"
            onClick={start}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Mic className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-0 flex-1 px-1 text-xs leading-snug text-muted-foreground">
            Натисни мікрофон і говори
          </span>
          {text ? (
            <button
              type="button"
              onClick={() => setText("")}
              className="shrink-0 rounded-full px-2 text-2xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Очистити
            </button>
          ) : null}
        </div>
      )}

      {error ? <p className="text-3xs text-destructive">{error}</p> : null}
    </div>
  );
}

/* ── Обговорення: бульбашки й композер один в один із чату задачі ── */

type DemoMessage = { id: number; own: boolean; text: string; at: string };

const MATE_REPLIES = [
  "Прийняв. Візьму в роботу після поточної правки.",
  "Ок, тоді роблю без тіні й скидаю на погодження.",
  "Зрозумів. Якщо клієнт попросить ще варіант — пиши сюди ж.",
];

function clockNow(): string {
  return new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

function TaskChatDemo() {
  const [messages, setMessages] = useState<DemoMessage[]>(() => [
    {
      id: 1,
      own: false,
      text: "Клієнт просить логотип більший і без тіні. Встигнемо сьогодні?",
      at: clockNow(),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const replyIndex = useRef(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    []
  );

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages, typing]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setMessages((prev) => [...prev, { id: prev.length + 1, own: true, text: body, at: clockNow() }]);
    setDraft("");
    setTyping(true);

    const timer = setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          own: false,
          text: MATE_REPLIES[replyIndex.current % MATE_REPLIES.length],
          at: clockNow(),
        },
      ]);
      replyIndex.current += 1;
    }, 1100);
    timers.current.push(timer);
  };

  return (
    <div>
      <div
        ref={feedRef}
        className="flex max-h-[176px] flex-col gap-2.5 overflow-y-auto px-2.5 py-3"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex items-end gap-1.5", message.own && "flex-row-reverse")}
          >
            {message.own ? null : (
              <AvatarBase size={24} name="Марина Сидоренко" className="shrink-0" />
            )}
            <div
              className={cn(
                "flex min-w-0 max-w-[76%] flex-col gap-1",
                message.own && "items-end"
              )}
            >
              <div
                className={cn(
                  "relative cursor-default rounded-2xl py-1.5 pl-2.5 pr-12 text-xs leading-snug",
                  message.own
                    ? "thread-bubble-own rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground"
                )}
              >
                {message.own ? null : (
                  <span className="mb-0.5 block text-2xs font-semibold text-info-foreground">
                    Марина
                  </span>
                )}
                <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</span>
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-1.5 right-2.5 inline-flex items-center gap-1 whitespace-nowrap text-3xs tabular-nums",
                    message.own ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {message.at}
                </span>
              </div>
            </div>
          </div>
        ))}

        {typing ? (
          <div className="flex items-end gap-1.5">
            <AvatarBase size={24} name="Марина Сидоренко" className="shrink-0" />
            <div className="rounded-2xl rounded-bl-sm bg-muted px-2.5 py-1.5 text-xs italic text-muted-foreground">
              друкує…
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border/40 bg-card p-2.5">
        <div className="flex min-h-[38px] items-end gap-1 rounded-[20px] border border-border/60 bg-card p-1 pl-1.5 focus-within:border-primary/50">
          <textarea
            value={draft}
            rows={1}
            placeholder="Написати…"
            aria-label="Текст повідомлення"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-[7px] text-xs leading-snug outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={send}
            disabled={draft.trim().length === 0}
            aria-label="Надіслати"
            className={cn(
              "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full transition-colors",
              draft.trim().length === 0
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:opacity-90"
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-3xs text-muted-foreground">
          Демо — повідомлення нікуди не йдуть.
        </p>
      </div>
    </div>
  );
}
