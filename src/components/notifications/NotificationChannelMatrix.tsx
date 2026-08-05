import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { db } from "@/lib/supabaseClient";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  visibleNotificationCategories,
  type NotificationChannel,
} from "@/lib/notificationCategories";

/**
 * Матриця «категорія × канал» — один компонент на всі поверхні.
 *
 * Живе і в діалозі /notifications, і у вкладці «Налаштування» профілю. Саме
 * тому він сам вантажить і пише `channel_prefs`: дві копії логіки неминуче
 * розійшлись би, а розходження тут означає «людина вимкнула, а воно шлеться».
 *
 * Дефолт КОЖНОГО каналу — увімкнено: у БД зберігаються лише явні `false`
 * (див. isChannelEnabled у notificationCategories.ts). Тому порожній
 * channel_prefs — це «все вмикано», а не «нічого не налаштовано».
 */
export function NotificationChannelMatrix({
  userId,
  accessRole,
  jobRole,
  telegramLinked,
  className,
}: {
  userId: string | null;
  accessRole: string | null;
  jobRole: string | null;
  /** Чи привʼязаний Telegram — без нього тумблери каналу неактивні. */
  telegramLinked: boolean;
  className?: string;
}) {
  const [channelPrefs, setChannelPrefs] = useState<Record<string, Record<string, boolean>>>({});
  const [busy, setBusy] = useState(false);

  const visibleCategories = useMemo(
    () => visibleNotificationCategories({ accessRole, jobRole }),
    [accessRole, jobRole]
  );

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const { data } = await db
        .from("user_notification_settings" as never)
        .select("channel_prefs")
        .eq("user_id", userId)
        .maybeSingle();
      if (!active) return;
      const row = data as unknown as {
        channel_prefs?: Record<string, Record<string, boolean>> | null;
      } | null;
      setChannelPrefs(row?.channel_prefs ?? {});
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const isOn = (categoryKey: string, channel: NotificationChannel) =>
    channelPrefs[categoryKey]?.[channel] !== false;

  const toggle = async (categoryKey: string, channel: NotificationChannel) => {
    if (!userId || busy) return;
    const previous = channelPrefs;
    const next = !isOn(categoryKey, channel);
    const nextPrefs: Record<string, Record<string, boolean>> = {
      ...channelPrefs,
      [categoryKey]: { ...(channelPrefs[categoryKey] ?? {}), [channel]: next },
    };
    setChannelPrefs(nextPrefs);
    setBusy(true);
    const { error } = await db
      .from("user_notification_settings" as never)
      .upsert({ user_id: userId, channel_prefs: nextPrefs } as never, { onConflict: "user_id" });
    setBusy(false);
    if (error) {
      setChannelPrefs(previous);
      toast.error("Не вдалося зберегти налаштування.");
    }
  };

  return (
    <div className={cn("overflow-hidden rounded-[var(--radius)] border border-border/60", className)}>
      <div className="flex items-center justify-end gap-6 border-b border-border/60 bg-muted/30 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="w-12 text-center">Push</span>
        <span className="w-16 text-center">Telegram</span>
      </div>
      {visibleCategories.map((cat) => (
        <div
          key={cat.key}
          className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{cat.label}</div>
            <div className="truncate text-xs text-muted-foreground">{cat.description}</div>
          </div>
          <div className="flex shrink-0 items-center gap-6">
            <div className="flex w-12 justify-center">
              {cat.telegramOnly ? (
                <span className="text-xs text-muted-foreground" title="Цей тип шлеться лише в Telegram">
                  —
                </span>
              ) : (
                <Switch
                  checked={isOn(cat.key, "push")}
                  disabled={busy}
                  onCheckedChange={() => toggle(cat.key, "push")}
                  label={`Push: ${cat.label}`}
                />
              )}
            </div>
            <div className="flex w-16 justify-center">
              <Switch
                checked={isOn(cat.key, "telegram")}
                disabled={busy || !telegramLinked}
                onCheckedChange={() => toggle(cat.key, "telegram")}
                label={`Telegram: ${cat.label}`}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
