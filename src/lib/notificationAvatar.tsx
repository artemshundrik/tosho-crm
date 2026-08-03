// Тон, іконка та ініціали сповіщення — спільне джерело для сторінки /notifications
// і для панелі сповіщень у шапці. Обидві поверхні мають показувати той самий тип
// події однаково, тож логіка живе тут, а не всередині сторінки.
import { BadgeCheck, BellRing, PartyPopper, PlaneTakeoff, ShieldAlert } from "lucide-react";

import type { NotificationItem } from "@/lib/notifications";

export type NotificationVisualTone =
  | "mention"
  | "birthday"
  | "vacation"
  | "success"
  | "warning"
  | "default";

export function getNotificationToneClasses(tone: NotificationVisualTone) {
  if (tone === "mention") {
    return "border-info-soft-border bg-info-soft text-info-foreground";
  }
  if (tone === "birthday") {
    return "border-danger-soft-border bg-danger-soft text-danger-foreground";
  }
  if (tone === "vacation") {
    return "border-warning-soft-border bg-warning-soft text-warning-foreground";
  }
  if (tone === "success") {
    return "border-success-soft-border bg-success-soft text-success-foreground";
  }
  if (tone === "warning") {
    return "border-warning-soft-border bg-warning-soft text-warning-foreground";
  }
  return "border-border/70 bg-muted/50 text-foreground";
}

export function extractNotificationName(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  const markerIndex = Math.max(normalized.lastIndexOf(" у "), normalized.lastIndexOf(" в "));
  const subject = markerIndex >= 0 ? normalized.slice(markerIndex + 3).trim() : normalized;
  const clean = subject.replace(/[.,;:!?]+$/g, "");
  const words = clean.split(" ").filter(Boolean).slice(0, 2);
  return words.join(" ").trim() || "CRM";
}

export function getNotificationInitials(value: string) {
  const words = value.split(" ").filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
  return initials || "CR";
}

export function getNotificationAvatarMeta(item: NotificationItem) {
  const lowerTitle = item.title.toLowerCase();
  const name = extractNotificationName(item.title);

  if (lowerTitle.includes("згадав")) {
    return {
      initials: getNotificationInitials(name),
      icon: <BellRing className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("mention"),
      badgeClass: getNotificationToneClasses("mention"),
    };
  }

  if (lowerTitle.includes("день народження")) {
    return {
      initials: getNotificationInitials(name),
      icon: <PartyPopper className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("birthday"),
      badgeClass: getNotificationToneClasses("birthday"),
    };
  }

  if (lowerTitle.includes("відпуст")) {
    return {
      initials: getNotificationInitials(name),
      icon: <PlaneTakeoff className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("vacation"),
      badgeClass: getNotificationToneClasses("vacation"),
    };
  }

  if (item.tone === "success") {
    return {
      initials: "OK",
      icon: <BadgeCheck className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("success"),
      badgeClass: getNotificationToneClasses("success"),
    };
  }

  if (item.tone === "warning") {
    return {
      initials: "AL",
      icon: <ShieldAlert className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("warning"),
      badgeClass: getNotificationToneClasses("warning"),
    };
  }

  return {
    initials: getNotificationInitials(name),
    icon: <BellRing className="h-4 w-4" />,
    avatarClass: getNotificationToneClasses("default"),
    badgeClass: getNotificationToneClasses("default"),
  };
}
