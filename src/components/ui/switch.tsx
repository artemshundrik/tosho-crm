import { cn } from "@/lib/utils";

/**
 * Перемикач стану.
 *
 * Візуальна мова взята з тумблера, який досі жив локально в NotificationsPage
 * (кругла доріжка, біла кулька, залита доріжка у ввімкненому стані) — тут вона
 * винесена в дизайн-систему з розмірами, щоб той самий контрол можна було
 * ставити і у формі, і в щільному рядку таблиці.
 *
 * На звичайній кнопці з role="switch", а не на radix: розмітка проста, а
 * доступність тут вичерпується роллю, aria-checked і фокусом.
 */
const SWITCH_SIZE = {
  sm: { track: "h-5 w-9", knob: "h-3.5 w-3.5", on: "translate-x-[18px]", off: "translate-x-[3px]" },
  md: { track: "h-7 w-12", knob: "h-5 w-5", on: "translate-x-6", off: "translate-x-1" },
} as const;

const SWITCH_TONE = {
  primary: "border-primary/35 bg-primary",
  success: "border-success-soft-border bg-success-solid",
} as const;

export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  size?: keyof typeof SWITCH_SIZE;
  tone?: keyof typeof SWITCH_TONE;
  disabled?: boolean;
  className?: string;
};

export function Switch({
  checked,
  onCheckedChange,
  label,
  size = "md",
  tone = "primary",
  disabled = false,
  className,
}: SwitchProps) {
  const dims = SWITCH_SIZE[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        dims.track,
        checked
          ? SWITCH_TONE[tone]
          : // Вимкнений стан має читатися як «вимкнено», а не «заблоковано»:
            // блідий bg-muted на світлій темі майже зливався з рядком і давав
            // вигляд disabled. Доріжка тепер помітно темніша за фон, а на
            // наведення ще темнішає — тобто контрол явно живий.
            "border-transparent bg-foreground/[0.18] hover:bg-foreground/[0.28]",
        disabled && "cursor-not-allowed opacity-50 hover:bg-foreground/[0.18]",
        className
      )}
    >
      <span
        className={cn(
          // Кулька світла й з обідком — на темнішій доріжці вона тримає форму
          // і не губиться.
          "pointer-events-none inline-block rounded-full bg-background ring-1 ring-foreground/5 transition-transform",
          dims.knob,
          checked ? dims.on : dims.off
        )}
      />
    </button>
  );
}
