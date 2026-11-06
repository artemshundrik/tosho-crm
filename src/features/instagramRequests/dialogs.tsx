import * as React from "react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

import { clientName, managerLoad } from "./presentation";
import type { RequestRow } from "./queries";
import { CLOSE_REASONS, type CloseReason } from "./rules";

export function CloseDialog({
  request,
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  request: RequestRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: (reason: CloseReason) => void;
}) {
  const [reason, setReason] = React.useState<CloseReason | null>(null);
  React.useEffect(() => {
    if (open) setReason(null);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] gap-0 p-0 sm:p-0">
        <DialogHeader className="p-4">
          <DialogTitle>Закрити {clientName(request)} без ліда</DialogTitle>
          <DialogDescription>Заявка перейде у вкладку «Закриті». Якщо людина напише знову, вона повернеться до вас.</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Причина">
          {CLOSE_REASONS.map((option) => (
            <label
              key={option.key}
              className={cn("flex cursor-pointer items-start gap-2.5 border-t border-border px-4 py-2.5", reason === option.key && "bg-primary/8")}
            >
              <input type="radio" name="close-reason" className="mt-[3px]" checked={reason === option.key} onChange={() => setReason(option.key)} />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <DialogFooter className="border-t border-border p-3 sm:p-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button disabled={!reason} loading={busy} onClick={() => reason && onConfirm(reason)}>
            Закрити заявку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PassDialog({
  request,
  open,
  onOpenChange,
  managers,
  requests,
  handoverMinutes,
  now,
  busy,
  onConfirm,
}: {
  request: RequestRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managers: WorkspaceMemberDisplayRow[];
  requests: RequestRow[];
  handoverMinutes: number;
  now: Date;
  busy: boolean;
  onConfirm: (toUserId: string, note: string) => void;
}) {
  const [target, setTarget] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setTarget(null);
      setNote("");
    }
  }, [open]);
  const options = managers
    .filter((manager) => manager.userId !== request.assigned_user_id)
    .map((manager) => ({ manager, load: managerLoad(requests, manager.userId, now) }))
    // Відсутніх не ховаємо: людина може знати, що колега вже вийшов. Але вони внизу.
    .sort((a, b) => Number(Boolean(a.manager.absenceToday)) - Number(Boolean(b.manager.absenceToday)) || a.load.fresh + a.load.working - (b.load.fresh + b.load.working));
  const chosen = options.find((option) => option.manager.userId === target)?.manager;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] gap-0 p-0 sm:p-0">
        <DialogHeader className="p-4">
          <DialogTitle>Передати {clientName(request)}</DialogTitle>
          <DialogDescription>
            {request.first_response_at
              ? "Новий менеджер отримає сповіщення й продовжить розмову."
              : `Новий менеджер отримає сповіщення і ${handoverMinutes} хв на відповідь.`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[320px] overflow-y-auto">
          {options.length === 0 ? <p className="border-t border-border p-4 text-sm text-muted-foreground">Більше немає менеджерів, яким можна передати.</p> : null}
          {options.map(({ manager, load }) => (
            <button
              key={manager.userId}
              type="button"
              aria-pressed={target === manager.userId}
              onClick={() => setTarget(manager.userId)}
              className={cn("flex w-full flex-col gap-1 border-t border-border px-4 py-2.5 text-left hover:bg-muted/50", target === manager.userId && "bg-primary/8")}
            >
              <span className="flex items-center gap-1.5 text-xs">
                <AvatarBase
                  src={manager.avatarDisplayUrl ?? manager.avatarUrl}
                  name={manager.label}
                  fallback={manager.initials}
                  size={18}
                  fallbackClassName="text-2xs font-semibold"
                  showStatusIndicator={false}
                />
                {manager.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {manager.absenceToday ? "Сьогодні відсутній · " : ""}
                Нових {load.fresh}, в роботі {load.working}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
          <label htmlFor="pass-note" className="text-xs text-muted-foreground">
            Коментар колезі, якщо треба
          </label>
          <Input id="pass-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
        </div>
        <DialogFooter className="border-t border-border p-3 sm:p-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button disabled={!target} loading={busy} onClick={() => target && onConfirm(target, note.trim())}>
            {chosen ? `Передати: ${chosen.label}` : "Передати"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
