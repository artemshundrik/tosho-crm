import * as React from "react";
import { Globe, Loader2, Mail, Phone, User } from "lucide-react";

import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { HoverTip } from "@/components/ui/hover-tip";
import { cn } from "@/lib/utils";
import { toneBadgeClass } from "@/lib/statusTones";
import { loadPartyHoverInfo, type PartyHoverInfo, type PartyKind } from "@/lib/partyHoverInfo";

/**
 * Картка замовника або ліда під курсором — та сама ідея, що й для людини:
 * коротка довідка там, де ти вирішуєш, а не переходиш на сторінку.
 *
 * Дані вантажаться ЛІНИВО при першому наведенні й кешуються, тож списки не
 * платять за це нічим, поки на логотип не навели.
 */

export type PartyHoverTarget = {
  kind: PartyKind;
  id: string;
  /** Те, що вже відоме списку — показуємо одразу, поки вантажиться решта. */
  name: string;
  logoUrl?: string | null;
  /** Менеджер прорахунку/задачі — часто відрізняється від менеджера картки. */
  managerLabel?: string | null;
  managerAvatarUrl?: string | null;
};

const KIND_LABEL: Record<PartyKind, string> = {
  customer: "Замовник",
  lead: "Лід",
};

function Line({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-2xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{children}</span>
    </div>
  );
}

function CardBody({ target, info, loading }: { target: PartyHoverTarget; info: PartyHoverInfo | null; loading: boolean }) {
  const name = info?.name || target.name;
  const contacts = [
    info?.phone ? { icon: Phone, value: info.phone } : null,
    info?.email ? { icon: Mail, value: info.email } : null,
    info?.website ? { icon: Globe, value: info.website.replace(/^https?:\/\//, "") } : null,
  ].filter(Boolean) as Array<{ icon: typeof Phone; value: string }>;

  return (
    <div className="w-[248px]">
      <div className="flex items-start gap-2.5">
        <EntityAvatar src={info?.logoUrl ?? target.logoUrl ?? null} name={name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight text-foreground">{name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-3xs font-semibold",
                target.kind === "customer" ? toneBadgeClass.success : toneBadgeClass.info
              )}
            >
              {KIND_LABEL[target.kind]}
            </span>
            {info?.source ? (
              <span className="truncate text-3xs text-muted-foreground">джерело: {info.source}</span>
            ) : null}
          </div>
        </div>
      </div>

      {info?.legalName && info.legalName !== name ? (
        <div className="mt-2 truncate text-2xs text-muted-foreground">{info.legalName}</div>
      ) : null}

      {target.managerLabel ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-[10px] border border-border/50 bg-muted/30 px-2.5 py-1.5">
          <AvatarBase
            src={target.managerAvatarUrl ?? null}
            name={target.managerLabel}
            fallback={target.managerLabel.slice(0, 2).toUpperCase()}
            assetVariant="xs"
            size={22}
            showStatusIndicator={false}
          />
          <span className="min-w-0 flex-1 truncate text-2xs">
            <span className="text-muted-foreground">Менеджер: </span>
            <span className="font-medium text-foreground">{target.managerLabel}</span>
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-2.5 flex items-center gap-2 text-2xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Завантажуємо контакти…
        </div>
      ) : contacts.length > 0 || info?.contactName ? (
        <div className="mt-2.5 space-y-1 border-t border-border/40 pt-2">
          {info?.contactName ? <Line icon={User}>{info.contactName}</Line> : null}
          {contacts.map((contact) => (
            <Line key={contact.value} icon={contact.icon}>
              {contact.value}
            </Line>
          ))}
        </div>
      ) : (
        <div className="mt-2.5 border-t border-border/40 pt-2 text-2xs text-muted-foreground">
          Контактів не вказано
        </div>
      )}
    </div>
  );
}

export function PartyHoverCard({
  target,
  children,
  side = "top",
}: {
  target: PartyHoverTarget | null;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const [info, setInfo] = React.useState<PartyHoverInfo | null>(null);
  const [loading, setLoading] = React.useState(false);
  // Було: картка відкривалась одразу зі спінером «Завантажуємо контакти…» і
  // доростала, коли відповідь приходила. Тепер HoverTip чекає готовності,
  // а спінер лишився фолбеком для повільної мережі (ліміт очікування).
  const [settled, setSettled] = React.useState(false);
  const requestedRef = React.useRef<string | null>(null);

  const handleEnter = React.useCallback(() => {
    if (!target) return;
    const key = `${target.kind}:${target.id}`;
    if (requestedRef.current === key) return;
    requestedRef.current = key;
    setLoading(true);
    void loadPartyHoverInfo(target.kind, target.id)
      .then((value) => setInfo(value))
      .finally(() => {
        setLoading(false);
        setSettled(true);
      });
  }, [target]);

  if (!target) return <>{children}</>;

  return (
    <HoverTip
      label={<CardBody target={target} info={info} loading={loading} />}
      side={side}
      contentClassName="max-w-none rounded-[14px] p-3"
      ready={settled}
    >
      {/* Запит стартує на вході курсора, а не на відкритті бульбашки: так
          контакти встигають приїхати до того, як людина їх шукатиме. */}
      <span className="inline-flex" onMouseEnter={handleEnter} onFocusCapture={handleEnter}>
        {children}
      </span>
    </HoverTip>
  );
}
