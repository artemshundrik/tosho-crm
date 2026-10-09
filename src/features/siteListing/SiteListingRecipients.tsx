import * as React from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase } from "@/components/app/avatar-kit";
import { Bell } from "@/components/icons/appIcons";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatJobRole } from "@/lib/jobRoles";
import { isSiteListingDefaultRecipient, pickSiteListingRecipients } from "@/lib/siteListing/recipients";

import { useSiteListingAudience, useSiteListingNotifyIds, useSiteListingSaveNotifyIds } from "./queries";

/**
 * Рядок у шапці блоку «На сайт»: кому йде сповіщення про нові моделі
 * (REQ-311#p18). Вибирати можна з тих, хто бачить блок, — посилання зі
 * сповіщення веде саме сюди. Поки ніхто не вибирав, отримує лише власник.
 */

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

  const loading = audience.isPending || notifyIds.isPending;
  const summary = loading
    ? "Сповіщення про нові моделі: …"
    : notifyIds.isError || audience.isError
      ? "Не вдалося прочитати, кому йдуть сповіщення."
      : selected.length === 0
        ? "Сповіщення про нові моделі нікому не йдуть"
        : `Сповіщення отримують: ${selected.map(firstName).join(", ")}`;

  const ready = !loading && !notifyIds.isError && !audience.isError;

  // Поповер стоїть під початком рядка, а не під «Змінити»: зведення міняє
  // довжину з кожною галочкою («Артем» → «нікому не йдуть»), і прив'язаний до
  // посилання поповер з'їжджав би вбік просто під курсором.
  return (
    <Popover>
      <PopoverAnchor asChild>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-2xs text-muted-foreground">
          <Bell className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{summary}</span>
          {ready ? (
            <>
              <span aria-hidden="true">·</span>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-2 transition-colors hover:underline"
                >
                  Змінити
                </button>
              </PopoverTrigger>
            </>
          ) : null}
        </div>
      </PopoverAnchor>
      {ready ? (
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b border-border/60 px-3 py-2.5">
            <p className="text-xs font-medium text-foreground">Кому сповіщення про нові моделі</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              У CRM, пуш і Telegram, коли в черзі з'являються нові моделі або очікувана отримує ціну. Вимкнути для себе
              можна й у налаштуваннях сповіщень.
            </p>
          </div>
          <ul className="p-1.5">
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
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground">{member.label}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {isSiteListingDefaultRecipient(member) ? "Власник" : formatJobRole(member.jobRole) || "—"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {saved === null ? (
            <p className="border-t border-border/60 px-3 py-2 text-2xs text-muted-foreground">
              Поки ніхто не вибирав — сповіщення отримує лише власник.
            </p>
          ) : null}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
