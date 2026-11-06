import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AvatarBase } from "@/components/app/avatar-kit";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/layout/routes";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

import { callRequests, useRequestAction, type SettingsRow } from "./queries";
import { SectionLabel } from "./ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: SettingsRow;
  managers: WorkspaceMemberDisplayRow[];
  reviewers: WorkspaceMemberDisplayRow[];
};

const toNumber = (value: string) => Number.parseInt(value, 10) || 0;

function Pill({ active, onClick, member, children }: { active: boolean; onClick: () => void; member?: WorkspaceMemberDisplayRow; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-md transition-colors",
        member && "pl-1.5",
        active ? "border-primary/30 bg-primary/8 text-foreground" : "border-border text-muted-foreground hover:bg-muted"
      )}
    >
      {member ? (
        <AvatarBase
          src={member.avatarDisplayUrl ?? member.avatarUrl}
          name={member.label}
          fallback={member.initials}
          size={20}
          fallbackClassName="text-2xs font-semibold"
          showStatusIndicator={false}
          className={cn(!active && "opacity-50")}
        />
      ) : null}
      {children}
    </button>
  );
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Input id={id} inputMode="numeric" value={String(value)} onChange={(event) => onChange(toNumber(event.target.value))} />
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange, settings, managers, reviewers }: Props) {
  const navigate = useNavigate();
  const action = useRequestAction();
  const [form, setForm] = React.useState(settings);
  const [view, setView] = React.useState<"settings" | "test">("settings");
  const [testHandle, setTestHandle] = React.useState("olha.brandteam");
  const [testText, setTestText] = React.useState("Добрий день, скільки коштують пляшки з логотипом на 300 шт?");
  const [testKind, setTestKind] = React.useState<"ad" | "other">("ad");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(settings);
    setView("settings");
  }, [open, settings]);

  const patch = (next: Partial<SettingsRow>) => setForm((current) => ({ ...current, ...next }));

  const save = () => {
    action.mutate(
      {
        action: "save_settings",
        reminderMinutes: form.reminder_minutes,
        handoverMinutes: form.handover_minutes,
        workStartHour: form.work_start_hour,
        workEndHour: form.work_end_hour,
        autoReplyText: form.auto_reply_text,
        otherReviewerUserId: form.other_reviewer_user_id,
        roundExcludedUserIds: form.round_excluded_user_ids,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const createTest = async () => {
    setCreating(true);
    try {
      const result = await callRequests<{ requestId: string }>({
        action: "create_test",
        kind: testKind,
        handle: testHandle.trim() || "test.client",
        text: testText.trim() || "Тестове повідомлення",
        ...(testKind === "ad" ? { adTitle: "Тестове оголошення" } : {}),
      });
      onOpenChange(false);
      navigate(`${ROUTES.requests}/${result.requestId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося створити тестову заявку");
    } finally {
      setCreating(false);
    }
  };

  const toggleExcluded = (userId: string) =>
    patch({
      round_excluded_user_ids: form.round_excluded_user_ids.includes(userId)
        ? form.round_excluded_user_ids.filter((id) => id !== userId)
        : [...form.round_excluded_user_ids, userId],
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[760px] gap-4 overflow-y-auto">
        {view === "settings" ? (
          <>
            <DialogHeader>
              <DialogTitle>Налаштування заявок</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumberField id="set-reminder" label="Нагадування, хв" value={form.reminder_minutes} onChange={(value) => patch({ reminder_minutes: value })} />
              <NumberField id="set-handover" label="Передача, хв" value={form.handover_minutes} onChange={(value) => patch({ handover_minutes: value })} />
              <NumberField id="set-start" label="Початок дня, год" value={form.work_start_hour} onChange={(value) => patch({ work_start_hour: value })} />
              <NumberField id="set-end" label="Кінець дня, год" value={form.work_end_hour} onChange={(value) => patch({ work_end_hour: value })} />
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">Робочий час за Києвом, понеділок–п'ятниця.</p>
            <div className="flex flex-col gap-2">
              <SectionLabel>Хто бере заявки по колу</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {managers.map((manager) => (
                  <Pill key={manager.userId} member={manager} active={!form.round_excluded_user_ids.includes(manager.userId)} onClick={() => toggleExcluded(manager.userId)}>
                    {manager.label}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <SectionLabel>Хто переглядає «Інше»</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                <Pill active={form.other_reviewer_user_id === null} onClick={() => patch({ other_reviewer_user_id: null })}>
                  Усі СЕО
                </Pill>
                {reviewers.map((member) => (
                  <Pill key={member.userId} member={member} active={form.other_reviewer_user_id === member.userId} onClick={() => patch({ other_reviewer_user_id: member.userId })}>
                    {member.label}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="set-auto" className="text-xs text-muted-foreground">
                Автовідповідь поза робочим часом
              </label>
              <AutoTextarea id="set-auto" value={form.auto_reply_text} maxLength={1000} onChange={(event) => patch({ auto_reply_text: event.target.value })} />
            </div>
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={() => setView("test")}>
                Тестова заявка
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Скасувати
                </Button>
                <Button loading={action.isPending} onClick={save}>
                  Зберегти
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Тестова заявка</DialogTitle>
              <DialogDescription>Проходить коло й таймер, але сповіщення отримуєте лише ви. У цифри не входить, клієнту нічого не надсилається.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-1.5">
              <Pill active={testKind === "ad"} onClick={() => setTestKind("ad")}>
                З реклами
              </Pill>
              <Pill active={testKind === "other"} onClick={() => setTestKind("other")}>
                Не з реклами
              </Pill>
            </div>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <Input aria-label="Нік клієнта" value={testHandle} maxLength={60} onChange={(event) => setTestHandle(event.target.value)} />
              <Input aria-label="Текст клієнта" value={testText} maxLength={1000} onChange={(event) => setTestText(event.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setView("settings")}>
                Назад
              </Button>
              <Button loading={creating} onClick={() => void createTest()}>
                Створити
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
