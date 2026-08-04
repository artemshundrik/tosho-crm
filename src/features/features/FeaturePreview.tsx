import { ArrowRight, Check, Send } from "lucide-react";
import type { FeatureKey } from "@/lib/featureCatalog";

/**
 * Статичне прев'ю фічі для правої колонки сторінки «Можливості» —
 * маленьке вікно CRM, у якому видно, що саме там усередині, ще до кліку.
 *
 * Свідомо НЕ інтерактивне: жива версія живе в онбординг-вікні
 * (FeatureOnboardingDialog). Тут лише картинка, тому все aria-hidden.
 *
 * Класи повторюють справжній чат задачі (taskChat/ThreadFeed і
 * ThreadComposer) — міняєш там, звіряй і тут.
 */

const WINDOW_LABEL: Record<FeatureKey, string> = {
  telegram_bot: "профіль · сповіщення",
  voice_dictation: "дизайн-задача",
  task_chat: "обговорення",
};

/** Смужки еквалайзера — ті самі, що в композері чату. */
const WAVE_BARS = [
  { height: 6, delay: "0ms" },
  { height: 11, delay: "120ms" },
  { height: 8, delay: "240ms" },
  { height: 13, delay: "80ms" },
  { height: 7, delay: "300ms" },
  { height: 10, delay: "180ms" },
  { height: 5, delay: "60ms" },
];

export function FeaturePreview({ featureKey }: { featureKey: FeatureKey }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/60 px-2.5 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="ml-1 font-mono text-3xs text-muted-foreground">
          {WINDOW_LABEL[featureKey]}
        </span>
      </div>
      <div className="p-2.5" aria-hidden="true">
        {featureKey === "telegram_bot" ? <TelegramShot /> : null}
        {featureKey === "voice_dictation" ? <DictationShot /> : null}
        {featureKey === "task_chat" ? <ChatShot /> : null}
      </div>
    </div>
  );
}

function TelegramShot() {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-success-soft-border bg-success-soft px-2.5 py-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-card text-success-foreground">
          <Check className="h-3 w-3" />
        </span>
        <span className="text-3xs font-semibold text-success-foreground">Бот підключений</span>
      </div>
      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-3xs font-semibold text-primary-foreground">
        <Send className="h-3 w-3" />
        Відкрити бот
      </div>
    </div>
  );
}

function DictationShot() {
  return (
    <div className="grid gap-2">
      <div className="min-h-[38px] rounded-lg border border-border/60 px-2 py-1.5 text-3xs leading-4 text-muted-foreground">
        Логотип на чорному фоні, біла заливка, вектор…
      </div>
      <div className="flex items-center gap-1.5 rounded-full border border-destructive/40 py-1 pl-2 pr-1">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
        <span className="shrink-0 font-mono text-3xs font-semibold tabular-nums text-destructive">
          0:14
        </span>
        <span className="flex flex-1 items-center gap-[2px] px-0.5">
          {WAVE_BARS.map((bar, index) => (
            <span
              key={index}
              className="w-[2px] rounded-full bg-destructive/45 motion-safe:animate-[thread-wave_1.1s_ease-in-out_infinite]"
              style={{ height: bar.height, animationDelay: bar.delay }}
            />
          ))}
        </span>
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

function ChatShot() {
  return (
    <div className="grid gap-1.5">
      <div className="max-w-[86%] rounded-2xl rounded-bl-sm bg-muted px-2 py-1.5 text-3xs leading-4">
        Клієнт просить логотип більший і без тіні
      </div>
      <div className="ml-auto max-w-[86%] rounded-2xl rounded-br-sm bg-primary px-2 py-1.5 text-3xs leading-4 text-primary-foreground">
        Прийняв, зроблю до 16:00
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 rounded-full border border-border/60 py-1 pl-2.5 pr-1">
        <span className="flex-1 text-3xs text-muted-foreground">Написати…</span>
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
