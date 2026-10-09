import * as React from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase } from "@/components/app/avatar-kit";
import { Bell, BellOff } from "@/components/icons/appIcons";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverTip } from "@/components/ui/hover-tip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isSiteListingDefaultRecipient, pickSiteListingRecipients } from "@/lib/siteListing/recipients";

import { useSiteListingAudience, useSiteListingNotifyIds, useSiteListingSaveNotifyIds } from "./queries";

/**
 * Кому сповіщення про нові моделі (REQ-311#p18) — у шапці блоку «На сайт»:
 * дзвіночок і аватарки вибраних, імена — на наведенні, вибір — галочками зі
 * всієї команди. Поки ніхто не вибирав, отримує лише власник.
 *
 * Підказка стоїть УСЕРЕДИНІ кнопки, а не довкола: обидві на Popover, і
 * PopoverTrigger усередині підказки чіпляється за найближчий Popover — тобто
 * за підказку, а не за список.
 */

const STACK = 4;

const firstName = (member: { firstName: string; label: string }) => member.firstName.trim() || member.label;

export function SiteListingRecipients({ teamId }: { teamId: string | null }) {
  const { userId } = useAuth();
  const audience = useSiteListingAudience(userId);
  const notifyIds = useSiteListingNotifyIds(teamId);
  const save = useSiteListingSaveNotifyIds(teamId);

  const members = React.useMemo(() => audience.data ?? [], [audience.data]);
  const saved = notifyIds.data ?? null;
  const selected = pickSiteListingRecipients(members, saved);
  const selectedIds = new Set(selected.map((member) => member.userId));

  const toggle = (memberId: string, checked: boolean) => {
    // Перший вибір починається з того, що діяло досі, — з власника.
    const current = saved ?? members.filter(isSiteListingDefaultRecipient).map((member) => member.userId);
    const next = checked ? Array.from(new Set([...current, memberId])) : current.filter((id) => id !== memberId);
    save.mutate(next, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Вибір не зберігся."),
    });
  };

  const failed = notifyIds.isError || audience.isError;
  const ready = !audience.isPending && !notifyIds.isPending && !failed;
  const tip = failed
    ? "Не вдалося прочитати, кому сповіщення"
    : !ready
      ? null
      : selected.length === 0
        ? "Сповіщення нікому"
        : `Сповіщення: ${selected.map(firstName).join(", ")}`;
  const BellIcon = ready && selected.length === 0 ? BellOff : Bell;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!ready}
          aria-label={tip ?? "Кому сповіщення про нові моделі"}
          className="-my-1 inline-flex items-center rounded-full px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none"
        >
          <HoverTip label={tip}>
            <span className="flex items-center gap-1.5">
              <BellIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {selected.length > 0 ? (
                // Посадка як у стопці присутності (workspace-presence-widgets),
                // але фон суцільний: типовий bg-muted/60 напівпрозорий, і
                // ініціали нижньої просвічували крізь верхню — «АШ» і «ЮК»
                // зливались в одне. Там цього не видно, бо там переважно фото.
                // Накладання 4 px, а не 8: ініціали на 22 px займають середні
                // ~14 px кола, і сусідка на 8 px закривала другу літеру.
                <span className="flex items-center">
                  <span className="flex -space-x-1">
                    {selected.slice(0, STACK).map((member) => (
                      <span key={member.userId} className="relative">
                        <AvatarBase
                          src={member.avatarUrl}
                          name={member.label}
                          fallback={member.initials}
                          size={22}
                          className="border-2 border-background bg-muted dark:bg-muted"
                          fallbackClassName="text-3xs font-semibold"
                          showStatusIndicator={false}
                        />
                      </span>
                    ))}
                  </span>
                  {selected.length > STACK ? (
                    <span className="ml-1.5 text-xs font-semibold tabular-nums">+{selected.length - STACK}</span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </HoverTip>
        </button>
      </PopoverTrigger>
      {ready ? (
        <PopoverContent align="end" className="w-60 max-h-80 p-1.5">
          <ul>
            {members.map((member) => (
              <li key={member.userId}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                  <Checkbox
                    checked={selectedIds.has(member.userId)}
                    onCheckedChange={(value) => toggle(member.userId, value === true)}
                  />
                  {/* eager: у порталі поповера ледаче завантаження аватарки
                      не спрацьовує — як у вікні «Дивитись як». */}
                  <AvatarBase
                    src={member.avatarUrl}
                    name={member.label}
                    fallback={member.initials}
                    size={24}
                    loading="eager"
                    className="shrink-0 border-border/70"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{member.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
