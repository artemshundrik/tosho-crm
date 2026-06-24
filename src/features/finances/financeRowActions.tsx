import * as React from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Проста, надійна кнопка дії для рядків фінансів.
// Вся кнопка клікабельна; чіткі hover / active(pressed) / loading стани.
// Свідомо БЕЗ transition-all, will-change і hand-курсора — щоб нічого не мигало
// на наведенні (курсор однаковий і на кнопці, і в проміжках).

type ActionButtonProps = {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  label?: React.ReactNode;
  destructive?: boolean;
};

export function ActionButton({ onClick, title, disabled, loading, icon, label, destructive }: ActionButtonProps) {
  const iconOnly = label === undefined || label === null || label === "";
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium",
        "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none [&_img]:pointer-events-none",
        iconOnly ? "w-9" : "px-3",
        destructive
          ? "border-destructive/30 text-destructive hover:border-destructive/40 hover:bg-destructive/10 active:bg-destructive/[0.18]"
          : "border-border/60 bg-background text-foreground hover:bg-muted/60 active:bg-muted"
      )}
    >
      {loading ? <Loader2 className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

export function EditIconButton({
  onClick,
  title = "Редагувати",
  disabled,
}: {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return <ActionButton onClick={onClick} title={title} disabled={disabled} icon={<Pencil />} />;
}

export function DeleteIconButton({
  onClick,
  title = "Видалити",
  disabled,
}: {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return <ActionButton onClick={onClick} title={title} disabled={disabled} destructive icon={<Trash2 />} />;
}
