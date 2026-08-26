import { Lock, Users } from "lucide-react";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { toneSubtleClass, toneTextClass, type Tone } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import type { CardMeta, CardMetaKey, ChipWeight } from "./cardModel";
import { themeLook } from "./themeRegistry";

/**
 * Мітка нижнього ряду картки — одна на всі вигляди (дошка, стіна «Ідей»).
 *
 * Винесена сюди після того, як стіна намалювала свої мітки заново: колір і
 * порядок розійшлися з дошкою за тиждень, і ряд почав читатись як випадковий
 * набір плашок. Тепер вигляд один за побудовою.
 *
 * ПРАВИЛО КОЛЬОРУ ОДНЕ: кольорова рівно одна мітка в ряду. Дві змагаються за
 * увагу й перестають щось означати; одна працює якорем, від якого око читає
 * решту. Донедавна цю роль грала зона — 26.08.2026 зону з картки прибрано
 * (див. buildCardMeta), і якорем стала тема: саме за нею дошку групують.
 *
 * У КОЖНОЇ ТЕМИ СВІЙ ВИГЛЯД. Іконка й тон беруться з themeRegistry.ts. Доти
 * всі дванадцять тем ділили один фіолетовий і одну іконку шарів — тобто мітка
 * казала «тема існує» замість «котра саме». Іконка унікальна в кожної,
 * тон повторюється: колір підсилює, але ніколи не є єдиною ознакою.
 */

/**
 * Іконка при мітці — лише там, де вона додає сенсу, а не повторює слово.
 *
 * Теми тут немає: її іконка залежить від значення, а не від ключа мітки, і
 * приходить із themeRegistry.
 */
const META_ICONS: Partial<Record<CardMetaKey, ComponentType<{ className?: string }>>> = {
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
 * Мітка теми: заливка, текст і іконка — одного тону.
 *
 * `tone-*-subtle` дає лише фон і межу, кольору тексту в ньому немає. Тому тон
 * тексту додається окремо: сірий на кольоровій заливці читається як бруд, а не
 * як мітка.
 */
function themeClassName(tone: Tone): string {
  return cn(CHIP_SHAPE, "border-transparent", toneSubtleClass[tone], toneTextClass[tone]);
}

export function CardMetaChip({ item }: { item: CardMeta }) {
  const look = item.key === "theme" ? themeLook(item.label) : null;
  const Icon = look?.icon ?? META_ICONS[item.key];

  return (
    <Badge
      variant="outline"
      className={cn("gap-1", look ? themeClassName(look.tone) : weightClassName(item.weight))}
      title={item.hint}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {item.label}
    </Badge>
  );
}
