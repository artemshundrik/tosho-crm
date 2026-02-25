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
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { AvatarBase } from "@/components/app/avatar-kit";
import { cn } from "@/lib/utils";
import { Check, Image as ImageIcon, PlusCircle, Trash2, User, UserPlus } from "lucide-react";

export type LeadFormState = {
  companyName: string;
  legalName: string;
  firstName: string;
  lastName: string;
  email: string;
  phones: string[];
  source: string;
  website: string;
  logoUrl: string;
  manager: string;
};

export type LeadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: LeadFormState;
  setForm: React.Dispatch<React.SetStateAction<LeadFormState>>;
  teamMembers?: Array<{
    id: string;
    label: string;
    avatarUrl?: string | null;
  }>;
  saving?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  onSubmit: () => void;
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 -mx-6 px-6">
    <span className="text-xs uppercase tracking-wider text-muted-foreground font-normal">
      {children}
    </span>
    <Separator className="flex-1 bg-border/40" />
  </div>
);

const getInitials = (value?: string) => {
  if (!value) return "ЛД";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ЛД";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
};

export const LeadDialog: React.FC<LeadDialogProps> = ({
  open,
  onOpenChange,
  form,
  setForm,
  teamMembers = [],
  saving = false,
  error,
  title = "Новий лід",
  description = "Додайте контакт ліда для подальшої роботи.",
  submitLabel = "Створити ліда",
  onSubmit,
}) => {
  const [logoOpen, setLogoOpen] = React.useState(false);
  const [managerOpen, setManagerOpen] = React.useState(false);

  const hasManagerInList = teamMembers.some((member) => member.label === form.manager);
  const selectedManager = teamMembers.find((member) => member.label === form.manager);

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

        <div className="flex flex-wrap items-center gap-2">
          <Popover open={logoOpen} onOpenChange={setLogoOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={<ImageIcon className="h-4 w-4" />}
                active={!!form.logoUrl.trim()}
              >
                {form.logoUrl.trim() ? "Лого додано" : "Лого"}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-3" align="start">
              <div className="flex items-center gap-3">
                {form.logoUrl.trim() ? (
                  <img
                    src={form.logoUrl.trim()}
                    alt={form.companyName || "logo"}
                    className="h-12 w-12 rounded-full object-cover border border-border/60 bg-muted/20"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full border border-border/60 bg-muted/20 text-xs font-semibold text-muted-foreground flex items-center justify-center">
                    {getInitials(form.companyName || `${form.firstName} ${form.lastName}`.trim())}
                  </div>
                )}
                <Input
                  value={form.logoUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, logoUrl: e.target.value }))}
                  placeholder="Посилання на логотип"
                  className="h-9"
                />
              </div>
              {form.logoUrl.trim() ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 px-2 text-xs"
                  onClick={() => setForm((prev) => ({ ...prev, logoUrl: "" }))}
                >
                  Очистити
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>

          <Popover open={managerOpen} onOpenChange={setManagerOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={
                  selectedManager ? (
                    <AvatarBase
                      src={selectedManager.avatarUrl ?? null}
                      name={selectedManager.label}
                      fallback={selectedManager.label.slice(0, 2).toUpperCase()}
                      size={20}
                      className="border-border/60"
                      fallbackClassName="text-[10px] font-semibold"
                    />
                  ) : (
                    <User className="h-4 w-4" />
                  )
                }
                active={!!form.manager.trim()}
              >
                {form.manager.trim() || "Менеджер"}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="space-y-1">
                {form.manager && !hasManagerInList ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 h-9 text-sm truncate"
                    onClick={() => setManagerOpen(false)}
                  >
                    <AvatarBase
                      src={null}
                      name={form.manager}
                      fallback={form.manager.slice(0, 2).toUpperCase()}
                      size={20}
                      className="border-border/60 shrink-0"
                      fallbackClassName="text-[10px] font-semibold"
                    />
                    <span className="truncate">{form.manager}</span>
                  </Button>
                ) : null}
                {teamMembers.length > 0 ? (
                  teamMembers.map((member) => (
                    <Button
                      key={member.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 h-9 text-sm truncate"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, manager: member.label }));
                        setManagerOpen(false);
                      }}
                      title={member.label}
                    >
                      <AvatarBase
                        src={member.avatarUrl ?? null}
                        name={member.label}
                        fallback={member.label.slice(0, 2).toUpperCase()}
                        size={20}
                        className="border-border/60 shrink-0"
                        fallbackClassName="text-[10px] font-semibold"
                      />
                      <span className="truncate">{member.label}</span>
                      <Check
                        className={cn(
                          "ml-auto h-3.5 w-3.5 text-primary",
                          form.manager === member.label ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </Button>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground p-2">Немає менеджерів</div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-4">
          <SectionHeader>Компанія</SectionHeader>
          <div className="space-y-3">
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
                <Label>Сайт компанії</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                  placeholder="https://"
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
          </div>

          <SectionHeader>Контакти</SectionHeader>
          <div className="space-y-3">
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
                <Label>Прізвище</Label>
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
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="name@company.com"
                  className="h-9"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Телефон *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={addPhone}
                  >
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
