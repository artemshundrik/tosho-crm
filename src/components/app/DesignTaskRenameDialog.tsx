import * as React from "react";
import { Loader2, PencilLine } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DesignTaskRenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue?: string | null;
  taskLabel?: string | null;
  saving?: boolean;
  error?: string | null;
  onSubmit: (value: string) => void | Promise<void>;
};

export function DesignTaskRenameDialog({
  open,
  onOpenChange,
  initialValue,
  taskLabel,
  saving = false,
  error,
  onSubmit,
}: DesignTaskRenameDialogProps) {
  const [draft, setDraft] = React.useState(initialValue?.trim() ?? "");

  React.useEffect(() => {
    if (!open) return;
    setDraft(initialValue?.trim() ?? "");
  }, [initialValue, open]);

  const handleSubmit = () => {
    void onSubmit(draft.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <PencilLine className="h-4 w-4" />
            Редагувати назву
          </DialogTitle>
          <DialogDescription>
            Оновіть назву задачі{taskLabel ? ` ${taskLabel}` : ""}, якщо треба виправити помилку або уточнити формулювання.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="design-task-rename-input">Назва задачі</Label>
          <Input
            id="design-task-rename-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Вкажіть назву задачі"
            className="h-10"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              }
            }}
          />
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Зберегти назву
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
