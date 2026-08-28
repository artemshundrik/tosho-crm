import { Lightbulb } from "lucide-react";

import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { CardActionsMenu } from "./CardActionsMenu";
import { CARD_MENU_ATTR, buildCardMeta, formatIdleAge, idleDays, isCardMenuTarget } from "./cardModel";
import { ChecklistBar } from "./ChecklistBar";
import { isPapercutCard } from "./papercuts";
import { PriorityBars } from "./PriorityBars";
import { CardMetaChip } from "./CardMetaChip";
import { KIND_ICONS, KIND_LABELS, KIND_TONE, type DevRequest, type RequestStatus } from "./types";

/**
 * «Ідеї» — стіна нотаток.
 *
 * ЧОМУ НЕ СПИСОК. Рядок на всю ширину показує чотири поля й лишає 60%
 * порожнечі посередині: у списку працює вертикальне сканування по одній
 * колонці, а тут сканувати нічого — ідеї не впорядковані ні за чим. Стіна
 * заповнює екран самими ідеями, і кожну видно цілком, з описом, не відкриваючи.
 *
 * ВИСОТА РІВНЯЄТЬСЯ В МЕЖАХ РЯДКА. Спершу тут стояло `items-start` — мовляв,
 * ідея це думка, а не рядок таблиці, і розтягнута коротка нотатка буде
 * порожньою рамкою. Замір на живих картках показав протилежне: висоти вийшли
 * 190/190/172/190/221, тобто розкид усього 18 px. Це замало, щоб читатись як
 * навмисна різниця, і забагато, щоб не помічатись, — саме такий розкид і
 * виглядає неохайно.
 *
 * Причина малого розкиду в тому, що опис і так обрізаний на чотирьох рядках:
 * більшість нотаток мають рівно стільки. Тож рівняння коштує майже нічого, а
 * прибирає рвань. Ба більше — картки стали НИЖЧИМИ (180 замість 190): підвал
 * із мітками тепер притиснутий донизу через `mt-auto`, і фіксований відступ
 * над ним більше не потрібен.
 *
 * ТУТ БУЛИ CSS `columns` І ЦЕ БУЛА ПОМИЛКА. Задум був masonry — щоб нотатки
 * укладались щільно, без дірок. На живій стіні вийшло гірше за сітку одразу з
 * двох причин:
 *
 * 1. `columns` розкладає СТОВПЦЯМИ згори вниз. Друга нотатка опиняється ПІД
 *    першою, а не праворуч, тож порядок читання ламається. Я вважав це
 *    прийнятною ціною, бо «ідеї ні за чим не впорядковані», — але око однаково
 *    читає зліва направо й спотикається.
 * 2. Порожня остання колонка. П'ять нотаток у чотири колонки лягли як 2-2-1-0,
 *    і чверть екрана лишилась голою — це читається не як «щільно вкладено», а
 *    як зламана верстка.
 *
 * Колонок максимум ТРИ, а не чотири: на широкому екрані четверта робила
 * нотатку завузькою, опис обрізався на півслові, і кожна ідея виглядала
 * обрубаною.
 */
export function DevRequestWall({
  requests,
  emptyText,
  viewerId,
  onSelect,
  onMove,
  onEdit,
  onDelete,
  onCopyCard,
  canManage,
}: {
  requests: DevRequest[];
  emptyText: string;
  /** Хто дивиться — щоб не підписувати автором власні картки. */
  viewerId: string | null;
  onSelect: (request: DevRequest) => void;
  onMove: (id: string, status: RequestStatus) => void;
  onEdit: (request: DevRequest) => void;
  onDelete: (request: DevRequest) => void;
  /** Показуємо пункт «Картка для чату» лише там, де картка вже викочена. */
  onCopyCard?: (request: DevRequest) => void;
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
    // Третя колонка аж від 2xl (1536 px). На типовому ноутбуці 1280 три
    // колонки дають нотатку завширшки 320 px — опис ламається по два слова в
    // рядок і кожна ідея виглядає обрубаною. Дві по 485 px читаються спокійно.
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {requests.map((request) => {
        const KindIcon = KIND_ICONS[request.kind];
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
            // flex-col + h-full: картка займає всю висоту комірки сітки, а
            // підвал із мітками йде донизу (mt-auto нижче). Без цього рівняння
            // висоти лишало б порожнечу посеред картки замість під текстом.
            className={cn(
              "flex h-full flex-col rounded-2xl border border-border/60 bg-card p-3 text-left",
              "cursor-pointer transition-colors hover:border-foreground/25 hover:bg-muted/30",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            )}
          >
            {/* Порядок той самий, що на дошці: пріоритет → тип словом → номер
                → меню. «Ідеї» — це ті самі картки в іншому вигляді, і читатись
                вони мають однаково. */}
            <div className="flex items-center gap-2">
              <PriorityBars priority={request.priority} />
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 text-2xs font-semibold",
                  toneTextClass[KIND_TONE[request.kind]],
                  request.autoClassified && "border-b border-dashed border-current pb-px"
                )}
                title={
                  request.autoClassified ? "Тип поставив розбір — людина ще не звіряла" : undefined
                }
              >
                <KindIcon className="h-3.5 w-3.5" />
                {KIND_LABELS[request.kind]}
              </span>
              <HoverCopyText
                value={request.label}
                textClassName="font-mono text-2xs font-semibold tracking-wide text-muted-foreground"
                successMessage="Номер запиту скопійовано"
                copyLabel="Скопіювати номер запиту"
              />
              <span className="ml-auto" />
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
                onCopyCard={
                  onCopyCard && request.status === "released" ? () => onCopyCard(request) : undefined
                }
                  />
                </div>
              ) : null}
            </div>

            <p className="mt-2 text-[13px] font-medium leading-snug">{request.title}</p>

            {/* Опис — головна відмінність від списку: ідею видно цілком, не
                відкриваючи. Обрізаємо на чотирьох рядках, бо далі це вже не
                нотатка, а стаття, і сусідні колонки роз'їжджаються.

                ПОРОЖНІ РЯДКИ МІЖ АБЗАЦАМИ СТИСКАЄМО. Надиктований текст
                приходить із `\n\n`, а `whitespace-pre-wrap` малює порожній
                рядок як повноцінний — і line-clamp рахує його теж. Із чотирьох
                доступних рядків два йшли в порожнечу, а трикрапка обрізання
                падала на порожній рядок і висіла окремо, ніби зайвий символ у
                тексті. Абзаци лишаються (перенос є), зникає тільки повітря між
                ними — у прев'ю на чотири рядки воно не вартує половини місця. */}
            {request.body.trim() ? (
              <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-2xs leading-relaxed text-muted-foreground">
                {request.body.replace(/\n{2,}/g, "\n")}
              </p>
            ) : null}

            {/* Прогрес пунктів — той самий, що на дошці. Велика ідея з планом
                усередині має показувати його й тут: інакше «відклали» ховало б
                те, що половина роботи вже зроблена. */}
            <ChecklistBar
              items={request.checklist}
              papercut={isPapercutCard(request)}
              className="mt-2.5"
            />

            {/* Мітки — той самий buildCardMeta, що й на дошці: колір, порядок і
                склад мають збігатись за побудовою, а не за домовленістю. */}
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2.5">
              {buildCardMeta(request, { viewerId }).map((item) => (
                <CardMetaChip key={item.key} item={item} />
              ))}
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

          </div>
        );
      })}
    </div>
  );
}
