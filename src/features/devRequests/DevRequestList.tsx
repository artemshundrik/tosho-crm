import { ListTodo } from "lucide-react";

import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { moduleKeyLabel } from "@/lib/projectMap";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { CardActionsMenu } from "./CardActionsMenu";
import { MODULE_UNSET_LABEL } from "./cardModel";
import { PriorityBars } from "./PriorityBars";
import { KIND_ICONS, KIND_LABELS, KIND_TONE, type DevRequest, type RequestStatus } from "./types";

type DevRequestListProps = {
  requests: DevRequest[];
  /** Що написати, коли список порожній. Різний для «Ідей» і «Не робимо». */
  emptyText: string;
  onSelect: (request: DevRequest) => void;
  onMove: (id: string, status: RequestStatus) => void;
  onEdit: (request: DevRequest) => void;
  onDelete: (request: DevRequest) => void;
  canManage: boolean;
};

/**
 * «Не робимо» — СПИСКОМ, а не канбаном і не стіною.
 *
 * Стан колонки на дошці не має (розгорнуто над BOARD_COLUMNS у types.ts), тож
 * і показаний він має бути інакше: канбан-картка обіцяє, що її кудись рухають,
 * а тут рух рівно один — назад у чергу, і робиться він з меню.
 *
 * ЧОМУ НЕ СТІНА, як в «Ідеях». Стіна показує кожну картку цілком, з описом, —
 * це потрібно, коли з купи ВИБИРАЮТЬ. У «Не робимо» не вибирають: туди
 * заходять по конкретну картку, згадавши, що її колись відхилили. Для пошуку
 * очима по одній колонці рядок кращий за нотатку.
 *
 * ВІКУ ТУТ НЕМАЄ, і це не пропуск: справу закрито, тож «лежить 7 місяців»
 * нічого не додає. У «Ідеях» вік лишився — там він єдине, що не дає купі
 * відкладеного стати другим цвинтарем (див. formatIdleAge).
 *
 * Клік по рядку відкриває ту саму панель деталей, що й на дошці: список — це
 * інший вигляд тих самих карток, а не інший розділ.
 */
export function DevRequestList({
  requests,
  emptyText,
  onSelect,
  onMove,
  onEdit,
  onDelete,
  canManage,
}: DevRequestListProps) {
  if (requests.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-card">
      {requests.map((request) => {
        const KindIcon = KIND_ICONS[request.kind];
        const moduleLabel = moduleKeyLabel(request.moduleKey);
        return (
          <li key={request.id}>
            {/*
              div з role="button", а не сам <button>: усередині рядка вже є
              інтерактив (копіювання номера, меню «⋯»), а кнопка в кнопці —
              невалідна розмітка, яку браузер розбирає на свій розсуд.
              Клавіатуру при цьому не втрачаємо: tabIndex + Enter/Space.
            */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(request)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(request);
                }
              }}
              className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"
            >
              <HoverCopyText
                value={request.label}
                textClassName="w-16 shrink-0 font-mono text-2xs font-semibold tracking-wide text-muted-foreground"
                successMessage="Номер запиту скопійовано"
                copyLabel="Скопіювати номер запиту"
              />

              <p className="min-w-0 flex-1 truncate text-[13px] font-medium" title={request.title}>
                {request.title}
              </p>

              {/* Та сама шкала, що на дошці: списки «Ідеї» й «Не робимо» — це
                  ті самі картки, і пріоритет у них має читатись однаково. */}
              <PriorityBars priority={request.priority} className="hidden sm:inline-flex" />

              <span
                className={cn(
                  "hidden shrink-0 items-center gap-1 text-2xs font-semibold sm:inline-flex",
                  toneTextClass[KIND_TONE[request.kind]]
                )}
              >
                <KindIcon className="h-3.5 w-3.5" />
                {KIND_LABELS[request.kind]}
              </span>

              <span
                className={cn(
                  "hidden w-32 shrink-0 truncate text-2xs md:block",
                  moduleLabel ? "text-muted-foreground" : "text-muted-foreground/60"
                )}
              >
                {moduleLabel ?? MODULE_UNSET_LABEL}
              </span>

              {canManage ? (
                <div className="shrink-0">
                  <CardActionsMenu
                    // Дорога назад. Дошка забирає картку сюди дією «В ідеї»,
                    // список повертає її дією «У чергу» — перетягнути ні туди,
                    // ні звідти не можна: колонки в цих станів немає.
                    move={{
                      label: "У чергу",
                      icon: ListTodo,
                      onSelect: () => onMove(request.id, "queued"),
                    }}
                    onEdit={() => onEdit(request)}
                    onDelete={() => onDelete(request)}
                  />
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
