import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Відмова по заявці з причиною.
 *
 * Причину бачить лише заявник і owner/SEO — колонку `decision_comment` знято
 * з загального select, тож текст не «витікає» решті команди
 * (scripts/team-absences-selfservice.sql).
 */
export function AbsenceDeclineDialog({
  open,
  onOpenChange,
  personName,
  rangeLabel,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  rangeLabel: string;
  saving?: boolean;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (open) setComment("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Відхилити заявку</DialogTitle>
          <DialogDescription>
            {personName} · {rangeLabel}. Причину побачить лише заявник і керівництво.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="decline-comment">Причина</Label>
          <Textarea
            id="decline-comment"
            value={comment}
            placeholder="Необовʼязково, але з нею рішення зрозуміліше"
            onChange={(event) => setComment(event.target.value)}
            className="min-h-[80px]"
            maxLength={500}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Назад
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(comment.trim())} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Відхилити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
