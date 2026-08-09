import { Lightbulb } from "lucide-react";

import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { CardActionsMenu } from "./CardActionsMenu";
import { CARD_MENU_ATTR, formatIdleAge, idleDays, isCardMenuTarget } from "./cardModel";
import { ChecklistBar } from "./ChecklistBar";
import { PriorityBars } from "./PriorityBars";
import {
  KIND_ICONS,
  KIND_LABELS,
  KIND_TONE,
  ZONE_ICONS,
  ZONE_LABELS,
  ZONE_TONE,
  type DevRequest,
  type RequestStatus,
} from "./types";

/**
 * «Ідеї» — стіна нотаток.
 *
 * ЧОМУ НЕ СПИСОК. Рядок на всю ширину показує чотири поля й лишає 60%
 * порожнечі посередині: у списку працює вертикальне сканування по одній
 * колонці, а тут сканувати нічого — ідеї не впорядковані ні за чим. Стіна
 * заповнює екран самими ідеями, і кожну видно цілком, з описом, не відкриваючи.
 *
 * ЧОМУ РІЗНА ВИСОТА (CSS columns, а не grid). Ідея — це думка, а не рядок
 * таблиці: одна в реченні, інша в абзац. Рівна сітка обрізала б довгі до
 * висоти коротких, і найзмістовніші виглядали б найбіднішими.
 *
 * ЦІНА, ЯКУ ПЛАТИМО: `columns` розкладає нотатки СТОВПЦЯМИ згори вниз, а не
 * рядками зліва направо. Тобто порядок читання — по колонках, і колонки не
 * вирівнюються між собою по низу. Для «купи відкладеного», де порядок і так
 * ні про що, це прийнятно; для дошки з чергою було б неприйнятно.
 */
export function DevRequestWall({
  requests,
  emptyText,
  onSelect,
  onMove,
  onEdit,
  onDelete,
  canManage,
}: {
  requests: DevRequest[];
  emptyText: string;
  onSelect: (request: DevRequest) => void;
  onMove: (id: string, status: RequestStatus) => void;
  onEdit: (request: DevRequest) => void;
  onDelete: (request: DevRequest) => void;
  canManage: boolean;
}) {
  if (requests.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="[column-gap:0.75rem] columns-1 sm:columns-2 lg:columns-3 xl:columns-4">
      {requests.map((request) => {
        const KindIcon = KIND_ICONS[request.kind];
        const ZoneIcon = request.zone ? ZONE_ICONS[request.zone] : null;
        const ageLabel = formatIdleAge(request.createdAt);
        // Місяць — межа, після якої «відклали» починає означати «забули».
        const stale = idleDays(request.createdAt) >= 30;

        return (
          <div
            key={request.id}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              // Клік по меню не має відкривати дровер — та сама перевірка, що
              // й на дошці, тільки без drag-and-drop.
              if (isCardMenuTarget(event.target)) return;
              onSelect(request);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(request);
              }
            }}
            // break-inside: колонка не має розривати нотатку навпіл.
            className={cn(
              "mb-3 block w-full break-inside-avoid rounded-2xl border border-border/60 bg-card p-3 text-left",
              "cursor-pointer transition-colors hover:border-foreground/25",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn("shrink-0", toneTextClass[KIND_TONE[request.kind]])}>
                <KindIcon className="h-3.5 w-3.5" />
              </span>
              <HoverCopyText
                value={request.label}
                textClassName="font-mono text-2xs font-semibold tracking-wide text-muted-foreground"
                successMessage="Номер запиту скопійовано"
                copyLabel="Скопіювати номер запиту"
              />
              <PriorityBars priority={request.priority} className="ml-auto" />
              {canManage ? (
                <div {...{ [CARD_MENU_ATTR]: "" }} className="shrink-0">
                  <CardActionsMenu
                    move={{
                      label: "У чергу",
                      icon: Lightbulb,
                      onSelect: () => onMove(request.id, "queued"),
                    }}
                    onEdit={() => onEdit(request)}
                    onDelete={() => onDelete(request)}
                  />
                </div>
              ) : null}
            </div>

            <p className="mt-2 text-[13px] font-medium leading-snug">{request.title}</p>

            {/* Опис — головна відмінність від списку: ідею видно цілком, не
                відкриваючи. Обрізаємо на чотирьох рядках, бо далі це вже не
                нотатка, а стаття, і сусідні колонки роз'їжджаються. */}
            {request.body.trim() ? (
              <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-2xs leading-relaxed text-muted-foreground">
                {request.body}
              </p>
            ) : null}

            {/* Прогрес пунктів — той самий, що на дошці. Велика ідея з планом
                усередині має показувати його й тут: інакше «відклали» ховало б
                те, що половина роботи вже зроблена. */}
            <ChecklistBar items={request.checklist} className="mt-2.5" />

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {request.zone && ZoneIcon ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium",
                    toneSubtleClass[ZONE_TONE[request.zone]],
                    toneTextClass[ZONE_TONE[request.zone]]
                  )}
                >
                  <ZoneIcon className="h-3 w-3" />
                  {ZONE_LABELS[request.zone]}
                </span>
              ) : null}
              {request.theme ? (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                  {request.theme}
                </span>
              ) : null}
              <span
                className={cn(
                  "ml-auto shrink-0 text-2xs",
                  // Вік — єдине, що не дає купі відкладеного стати другим
                  // цвинтарем (див. formatIdleAge). Тому він тут завжди.
                  stale ? "font-medium text-warning-foreground" : "text-muted-foreground/70"
                )}
                title={`Лежить від ${new Date(request.createdAt).toLocaleDateString("uk-UA")}`}
              >
                {ageLabel}
              </span>
            </div>

            <span className="sr-only">{KIND_LABELS[request.kind]}</span>
          </div>
        );
      })}
    </div>
  );
}
