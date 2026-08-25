import { createElement } from "react";
import { AlertTriangle, Check, ChevronDown, Clock, Loader2, Pencil, XCircle } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_OPTIONS, formatStatusLabel, statusClasses, statusIcons } from "@/features/quotes/quote-details/config";
import { cn } from "@/lib/utils";

/**
 * Статус прорахунку як контрол, а не бейдж поруч із кнопками.
 *
 * Раніше в шапці стояли підряд бейдж статусу, кнопка переходу, «Змінити статус»
 * і «Створити дизайн-задачу»: чотири рівноцінні прямокутники, з яких неможливо
 * було зчитати ні поточний стан, ні головну дію. Тут стан і дія — один елемент:
 * видно, де ти стоїш, а всі переходи лежать під ним.
 *
 * Тригер НІКОЛИ не буває disabled. Причина, чому перехід зараз неможливий, має
 * бути читабельною — вона написана всередині меню, а не схована в сірій кнопці,
 * по якій нічого не стається.
 */

type QuoteStatusControlProps = {
  currentStatus: string;
  busy: boolean;
  /** Людською мовою: чому перехід зараз неможливий. null — усе гаразд. */
  blockReason: string | null;
  nextStatus: string | null;
  nextActionLabel: string;
  onPrimaryAction: () => void;
  onPickStatus: (status: string) => void;
  onOpenStatusDialog: () => void;
  onOpenCancelDialog: () => void;
};

export function QuoteStatusControl({
  currentStatus,
  busy,
  blockReason,
  nextStatus,
  nextActionLabel,
  onPrimaryAction,
  onPickStatus,
  onOpenStatusDialog,
  onOpenCancelDialog,
}: QuoteStatusControlProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            // На телефоні контрол вужчий: номер прорахунку і статус мають стати
            // в один рядок на 375 px, інакше шапка росте до трьох рядків.
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition-[filter] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 sm:gap-1.5 sm:px-2.5 sm:text-sm",
            statusClasses[currentStatus] ?? statusClasses.new
          )}
          aria-label={`Статус: ${formatStatusLabel(currentStatus)}. Змінити`}
        >
          {/* Іконку на телефоні ховаємо: статус там і так кольоровий і
              підписаний, а 20 px вирішують, чи стане він у рядок поруч із номером. */}
          {createElement(statusIcons[currentStatus] ?? Clock, { className: "hidden h-3.5 w-3.5 sm:block" })}
          <span className="truncate">{formatStatusLabel(currentStatus)}</span>
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronDown className="h-3 w-3 opacity-70" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[268px]">
        {blockReason ? (
          // Текст стану замість мертвої кнопки: людина бачить, чого саме бракує.
          <div className="tone-warning-subtle m-1 flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs leading-relaxed">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{blockReason}</span>
          </div>
        ) : nextStatus ? (
          <>
            <DropdownMenuLabel className="text-3xs uppercase tracking-caps text-muted-foreground">
              Наступний крок
            </DropdownMenuLabel>
            <DropdownMenuItem
              className="tone-success-subtle font-semibold focus:tone-success-subtle"
              onSelect={(event) => {
                event.preventDefault();
                onPrimaryAction();
              }}
            >
              {createElement(statusIcons[nextStatus] ?? Clock, { className: "mr-2 h-4 w-4" })}
              <span className="truncate">{nextActionLabel}</span>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-3xs uppercase tracking-caps text-muted-foreground">
          Змінити статус
        </DropdownMenuLabel>
        {STATUS_OPTIONS.filter((option) => option !== "cancelled").map((option) => {
          const isCurrent = option === currentStatus;
          return (
            <DropdownMenuItem
              key={`status-${option}`}
              disabled={Boolean(blockReason) || isCurrent}
              onSelect={(event) => {
                event.preventDefault();
                onPickStatus(option);
              }}
            >
              {createElement(statusIcons[option] ?? Clock, { className: "mr-2 h-4 w-4 text-muted-foreground" })}
              <span className="truncate">{formatStatusLabel(option)}</span>
              {isCurrent ? <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={Boolean(blockReason)}
          onSelect={(event) => {
            event.preventDefault();
            onOpenStatusDialog();
          }}
        >
          <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
          Змінити з приміткою…
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(blockReason) || currentStatus === "cancelled"}
          className="text-destructive focus:text-destructive"
          onSelect={(event) => {
            event.preventDefault();
            onOpenCancelDialog();
          }}
        >
          <XCircle className="mr-2 h-4 w-4" />
          Скасувати прорахунок…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
