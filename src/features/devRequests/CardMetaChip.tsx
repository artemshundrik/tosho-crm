import { Layers, Lock, Users } from "lucide-react";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import type { CardMeta, CardMetaKey, ChipWeight } from "./cardModel";
import { ZONE_ICONS, ZONE_TONE, type RequestZone } from "./types";

/**
 * Мітка нижнього ряду картки — одна на всі вигляди (дошка, стіна «Ідей»).
 *
 * Винесена сюди після того, як стіна намалювала свої мітки заново: колір і
 * порядок розійшлися з дошкою за тиждень, і ряд почав читатись як випадковий
 * набір плашок. Тепер вигляд один за побудовою.
 *
 * ПРАВИЛО КОЛЬОРУ ОДНЕ: кольорова лише ЗОНА. Тема, напрямок, автор і сигнали —
 * контурні. Дві кольорові мітки в ряду змагаються за увагу й перестають щось
 * означати; одна працює якорем, від якого око читає решту.
 */

/** Іконка при мітці — лише там, де вона додає сенсу, а не повторює слово. */
const META_ICONS: Partial<Record<CardMetaKey, ComponentType<{ className?: string }>>> = {
  theme: Layers,
  asked: Users,
  private: Lock,
};

/** Геометрія мітки — одна на всі: колір накладається зверху. */
const CHIP_SHAPE = "rounded-full px-2 py-0.5 text-2xs font-medium normal-case tracking-normal";

function weightClassName(weight: ChipWeight): string {
  if (weight === "quiet") {
    return cn(CHIP_SHAPE, "border-border/40 bg-transparent text-muted-foreground/70");
  }
  return cn(CHIP_SHAPE, "border-border/60 bg-muted/20 text-muted-foreground");
}

/**
 * Мітка зони: заливка, текст і іконка — одного тону.
 *
 * `tone-*-subtle` дає лише фон і межу, кольору тексту в ньому немає. Через це
 * мітка спершу успадковувала сірий `text-muted-foreground` від звичайного
 * чіпа — сірий текст на кольоровій заливці читається як бруд, а не як мітка.
 */
function zoneClassName(zone: RequestZone): string {
  return cn(
    CHIP_SHAPE,
    "border-transparent",
    toneSubtleClass[ZONE_TONE[zone]],
    toneTextClass[ZONE_TONE[zone]]
  );
}

export function CardMetaChip({
  item,
  zone,
  autoClassified = false,
}: {
  item: CardMeta;
  /** Зона картки — потрібна лише мітці `zone`, щоб узяти свій тон і іконку. */
  zone: RequestZone | null;
  /** Пунктир «це припущення розбору» — той самий, що під типом угорі. */
  autoClassified?: boolean;
}) {
  const isZone = item.key === "zone" && zone;
  const Icon = isZone ? ZONE_ICONS[zone] : META_ICONS[item.key];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        isZone ? zoneClassName(zone) : weightClassName(item.weight),
        // border-current бере колір тону, тож межа лишається кольоровою.
        isZone && autoClassified && "border border-dashed border-current"
      )}
      title={item.hint}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {item.label}
    </Badge>
  );
}
