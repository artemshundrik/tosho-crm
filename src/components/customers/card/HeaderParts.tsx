import { useEffect, useRef, useState } from "react";

import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { ChevronDown, ExternalLink, Globe, Phone } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CUSTOMER_LEAD_SOURCES, SourceSelect } from "../customerSources";
import type { TeamMemberOption } from "./useTeamMembers";

/**
 * Шапка картки замовника: лого, назва, менеджер, джерело, оплата, сайт —
 * усе правиться на місці, кожне пишеться окремо (`useCustomerQuickSave`).
 * Ці ж шматки стоять у шапці бічної панелі.
 */

const CHIP = "h-8 gap-1.5 px-2.5 text-sm font-normal";
export const REFERRAL_SOURCE = "Рекомендація";

/** Поле, що пише на виході з нього або Enter, а Esc повертає як було. */
function useCommitOnBlur(value: string, onCommit: (next: string) => void, options?: { required?: boolean }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  // blur() нижче спрацьовує одразу, і в onBlur ще старий `text`: без цього Esc зберігав би.
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  return {
    value: text,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setText(event.target.value),
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      if (cancelled.current) {
        cancelled.current = false;
        return;
      }
      // Обовʼязкове поле порожнім не пишемо — повертаємо збережене.
      if (options?.required && !text.trim()) setText(value);
      else if (text !== value) onCommit(text);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        setText(value);
        cancelled.current = true;
        event.currentTarget.blur();
      }
    },
  };
}

export function NameInput(props: { value: string; size?: "page" | "panel"; label?: string; onCommit: (name: string) => void }) {
  const field = useCommitOnBlur(props.value, props.onCommit, { required: true });
  return (
    <input
      {...field}
      aria-label={props.label ?? "Назва замовника"}
      aria-invalid={!field.value.trim() || undefined}
      className={cn(
        "-ml-2 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 font-semibold tracking-tight text-foreground outline-none",
        "hover:border-line-strong hover:bg-card focus-visible:border-foreground/50 focus-visible:bg-card aria-invalid:border-danger-soft-border",
        props.size === "panel" ? "h-9 text-lg" : "h-11 max-w-[560px] text-2xl",
      )}
    />
  );
}

export function LogoButton(props: {
  src: string | null;
  name: string;
  size: number;
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex shrink-0 flex-col items-start gap-1">
      <button
        type="button"
        aria-label="Змінити лого"
        title="Змінити лого"
        disabled={props.busy}
        onClick={() => input.current?.click()}
        className={cn("rounded-full outline-offset-2 transition-opacity hover:opacity-80", props.busy && "animate-pulse")}
      >
        <EntityAvatar src={props.src} name={props.name} size={props.size} />
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onFile(file);
        }}
      />
      {props.error ? <span className="max-w-40 text-2xs text-danger-foreground">{props.error}</span> : null}
    </div>
  );
}

export function ManagerChip(props: { value: string; label: string; members: TeamMemberOption[]; onChange: (id: string) => void }) {
  const known = props.members.find((member) => member.id === props.value);
  return (
    <Select value={props.value || undefined} onValueChange={props.onChange}>
      <SelectTrigger aria-label="Менеджер" className={cn("w-auto rounded-full", CHIP)}>
        {known || props.label ? (
          <span className="flex items-center gap-1.5">
            <AvatarBase src={known?.avatarUrl ?? null} name={known?.label ?? props.label} size={20} />
            {known?.label ?? props.label}
          </span>
        ) : (
          <SelectValue placeholder="Без менеджера" />
        )}
      </SelectTrigger>
      <SelectContent>
        {props.members.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            <span className="flex items-center gap-2">
              <AvatarBase src={member.avatarUrl} name={member.label} size={20} />
              {member.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** «Джерело · Рекомендація · Олена» — у спливному: джерело й хто порекомендував. */
export function SourceChip(props: {
  source: string;
  referredBy: string;
  onSource: (source: string) => void;
  onReferredBy: (referredBy: string) => void;
}) {
  const referred = useCommitOnBlur(props.referredBy, props.onReferredBy);
  const Icon = CUSTOMER_LEAD_SOURCES.find((option) => option.value === props.source)?.Icon;
  const label = [props.source, props.source === REFERRAL_SOURCE ? props.referredBy.trim() : ""].filter(Boolean).join(" · ");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="chip" className={CHIP}>
          {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
          <span className="max-w-60 truncate">{label || "не вказано"}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-72 gap-2 p-3">
        <SourceSelect value={props.source} onChange={props.onSource} />
        {props.source === REFERRAL_SOURCE ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            Хто порекомендував
            <Input {...referred} placeholder="Олена, «Нова Пошта»" />
          </label>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function PaymentSeg(props: { value: "cash" | "invoice" | null; onChange: (value: "cash" | "invoice") => void }) {
  return (
    <div role="group" aria-label="Форма оплати" className="inline-flex h-8 items-center rounded-full border border-line bg-card p-0.5">
      {(
        [
          ["invoice", "Рахунок"],
          ["cash", "Готівка"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={props.value === value}
          onClick={() => props.value !== value && props.onChange(value)}
          className={cn(
            "h-full rounded-full px-3 text-sm transition-colors",
            props.value === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function WebsiteChip(props: { value: string; onCommit: (website: string) => void }) {
  const field = useCommitOnBlur(props.value, props.onCommit);
  return (
    <label className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-card pl-2.5 pr-1 text-sm focus-within:border-foreground/50">
      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        {...field}
        aria-label="Сайт"
        placeholder="додати сайт"
        size={Math.max(10, Math.min(28, field.value.length + 1))}
        className="h-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
      />
      {props.value.trim() ? (
        <a
          href={websiteHref(props.value)}
          target="_blank"
          rel="noreferrer"
          aria-label="Відкрити сайт"
          title="Відкрити сайт"
          className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
        </a>
      ) : (
        <span className="w-1.5" />
      )}
    </label>
  );
}

const websiteHref = (value: string) => (/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);

/** Телефон основного контакту — щоб подзвонити, не шукаючи в контактах. */
export function PhoneChip(props: { phone: string; name: string }) {
  if (!props.phone.trim()) return <span className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", CHIP)}><Phone className="size-3.5" />немає</span>;
  return (
    <a
      href={`tel:${props.phone.replace(/\s+/g, "")}`}
      title={props.name ? `Подзвонити: ${props.name}` : "Подзвонити"}
      className={cn("inline-flex items-center rounded-full border border-line-strong bg-card hover:border-foreground/30", CHIP)}
    >
      <Phone className="size-3.5 text-muted-foreground" />
      <span className="font-mono text-xs tabular-nums">{props.phone}</span>
      {props.name ? <span className="max-w-32 truncate text-muted-foreground">{props.name}</span> : null}
    </a>
  );
}

/**
 * Факт шапки: дрібний підпис над значенням. Без підписів ряд чипів читався
 * як купа кнопок — не видно, де менеджер, а де джерело.
 */
export function HeaderFact(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{props.label}</span>
      <div className="flex min-w-0 items-center">{props.children}</div>
    </div>
  );
}
