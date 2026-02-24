import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Trash2, UserPlus } from "lucide-react";

export type LeadFormState = {
  companyName: string;
  legalName: string;
  firstName: string;
  lastName: string;
  email: string;
  phones: string[];
  source: string;
  website: string;
  manager: string;
};

export type LeadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: LeadFormState;
  setForm: React.Dispatch<React.SetStateAction<LeadFormState>>;
  saving?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  onSubmit: () => void;
};

export const LeadDialog: React.FC<LeadDialogProps> = ({
  open,
  onOpenChange,
  form,
  setForm,
  saving = false,
  error,
  title = "Новий лід",
  description = "Додайте контакт ліда для подальшої роботи.",
  submitLabel = "Створити ліда",
  onSubmit,
}) => {
  const updatePhone = (index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      phones: prev.phones.map((phone, i) => (i === index ? value : phone)),
    }));
  };

  const addPhone = () => {
    setForm((prev) => ({ ...prev, phones: [...prev.phones, ""] }));
  };

  const removePhone = (index: number) => {
    setForm((prev) => {
      if (prev.phones.length <= 1) return prev;
      return { ...prev, phones: prev.phones.filter((_, i) => i !== index) };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-medium flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Назва компанії *</Label>
              <Input
                value={form.companyName}
                onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                placeholder="Назва компанії"
                className="h-9"
              />
            </div>
            <div className="grid gap-2">
              <Label>Юридична назва</Label>
              <Input
                value={form.legalName}
                onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))}
                placeholder="Повна юридична назва"
                className="h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Імʼя *</Label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                placeholder="Імʼя"
                className="h-9"
              />
            </div>
            <div className="grid gap-2">
              <Label>Прізвище *</Label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                placeholder="Прізвище"
                className="h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="name@company.com"
                className="h-9"
              />
            </div>
            <div className="grid gap-2">
              <Label>Джерело *</Label>
              <Input
                value={form.source}
                onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                placeholder="Звідки отримали контакт"
                className="h-9"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Телефон *</Label>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={addPhone}>
                <PlusCircle className="h-4 w-4 mr-1" />
                Додати номер
              </Button>
            </div>
            <div className="space-y-2">
              {form.phones.map((phone, index) => (
                <div key={`phone-${index}`} className="flex items-center gap-2">
                  <Input
                    value={phone}
                    onChange={(e) => updatePhone(index, e.target.value)}
                    placeholder="+380..."
                    className="h-9"
                  />
                  {form.phones.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => removePhone(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Сайт компанії</Label>
              <Input
                value={form.website}
                onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                placeholder="https://"
                className="h-9"
              />
            </div>
            <div className="grid gap-2">
              <Label>Менеджер</Label>
              <Input
                value={form.manager}
                onChange={(e) => setForm((prev) => ({ ...prev, manager: e.target.value }))}
                placeholder="ПІБ менеджера"
                className="h-9"
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="pt-2 border-t border-border/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Збереження..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
