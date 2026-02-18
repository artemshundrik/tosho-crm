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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Building2,
  Check,
  Image as ImageIcon,
  Percent,
  UserPlus,
} from "lucide-react";

export type OwnershipOption = {
  value: string;
  label: string;
};

export type VatOption = {
  value: string;
  label: string;
  rate: number | null;
};

export type CustomerFormState = {
  name: string;
  legalName: string;
  ownershipType: string;
  vatRate: string;
  taxId: string;
  website: string;
  iban: string;
  logoUrl: string;
  contactName: string;
  contactPosition: string;
  contactPhone: string;
  contactEmail: string;
  contactBirthday: string;
};

export type CustomerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CustomerFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerFormState>>;
  ownershipOptions: OwnershipOption[];
  vatOptions: VatOption[];
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
  if (!value) return "Не вказано";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Не вказано";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
};

const POSITION_OPTIONS = [
  "Директор",
  "Власник",
  "Маркетолог",
  "Керівник відділу маркетингу",
  "Директор з маркетингу",
  "Менеджер відділу закупівель",
  "Офіс-менеджер",
  "Секретар",
];

export const CustomerDialog: React.FC<CustomerDialogProps> = ({
  open,
  onOpenChange,
  form,
  setForm,
  ownershipOptions,
  vatOptions,
  saving = false,
  error,
  title = "Новий замовник",
  description = "Додайте всі дані замовника, щоб одразу підхопити їх у прорахунку.",
  submitLabel = "Створити клієнта",
  onSubmit,
}) => {
  const currentOwnership = ownershipOptions.find(
    (option) => option.value === form.ownershipType
  );
  const currentVat = vatOptions.find((option) => option.value === form.vatRate);
  const currentYear = React.useMemo(() => new Date().getFullYear(), []);

  const [ownershipOpen, setOwnershipOpen] = React.useState(false);
  const [vatOpen, setVatOpen] = React.useState(false);
  const [logoOpen, setLogoOpen] = React.useState(false);
  const [birthdayOpen, setBirthdayOpen] = React.useState(false);

  const birthdayDate = form.contactBirthday
    ? new Date(form.contactBirthday)
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[800px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-medium flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Popover open={ownershipOpen} onOpenChange={setOwnershipOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={<Building2 className="h-4 w-4" />}
                active={!!form.ownershipType}
              >
                {currentOwnership?.label ?? "Тип власності"}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {ownershipOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 h-9 text-sm"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ownershipType: option.value }));
                      setOwnershipOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 text-primary",
                        form.ownershipType === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="text-sm">{option.label}</span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={vatOpen} onOpenChange={setVatOpen}>
            <PopoverTrigger asChild>
              <Chip
                size="md"
                icon={<Percent className="h-4 w-4" />}
                active={!!form.vatRate && form.vatRate !== "none"}
              >
                {currentVat?.label ?? "ПДВ"}
              </Chip>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="start">
              <div className="space-y-1">
                {vatOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 h-9 text-sm"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, vatRate: option.value }));
                      setVatOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 text-primary",
                        form.vatRate === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="text-sm">{option.label}</span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

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
                    alt={form.name || "logo"}
                    className="h-12 w-12 rounded-full object-cover border border-border/60 bg-muted/20"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full border border-border/60 bg-muted/20 text-xs font-semibold text-muted-foreground flex items-center justify-center">
                    {getInitials(form.name)}
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
        </div>

        <div className="space-y-4">
          <SectionHeader>Компанія</SectionHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Назва компанії *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Напр. ТОВ “Вектор”"
                  className="h-9"
                />
              </div>
              <div className="grid gap-2">
                <Label>Юридична назва</Label>
                <Input
                  value={form.legalName}
                  onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))}
                  placeholder="Повна назва"
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>ЄДРПОУ / ІПН</Label>
                <Input
                  value={form.taxId}
                  onChange={(e) => setForm((prev) => ({ ...prev, taxId: e.target.value }))}
                  placeholder="Код або ІПН"
                  className="h-9"
                />
              </div>
              <div className="grid gap-2">
                <Label>IBAN</Label>
                <Input
                  value={form.iban}
                  onChange={(e) => setForm((prev) => ({ ...prev, iban: e.target.value }))}
                  placeholder="UA..."
                  className="h-9"
                />
              </div>
            </div>
          </div>

          <SectionHeader>Контакти</SectionHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Контактна особа</Label>
                <Input
                  value={form.contactName}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))}
                  placeholder="Імʼя та прізвище"
                  className="h-9"
                />
              </div>
              <div className="grid gap-2">
                <Label>Посада</Label>
                <Select
                  value={form.contactPosition}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, contactPosition: value }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Оберіть посаду" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Номер телефону</Label>
                <Input
                  value={form.contactPhone}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                  placeholder="+380..."
                  className="h-9"
                />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                  placeholder="name@company.com"
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Сайт</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                  placeholder="https://"
                  className="h-9"
                />
              </div>
              <div className="grid gap-2">
                <Label>День народження</Label>
                <Popover open={birthdayOpen} onOpenChange={setBirthdayOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-9 w-full justify-between px-3 text-sm font-normal",
                        !form.contactBirthday && "text-muted-foreground"
                      )}
                    >
                      {form.contactBirthday
                        ? format(birthdayDate ?? new Date(), "dd.MM.yyyy", { locale: uk })
                        : "dd.mm.yyyy"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={birthdayDate}
                      onSelect={(date) => {
                        if (!date) return;
                        setForm((prev) => ({
                          ...prev,
                          contactBirthday: format(date, "yyyy-MM-dd"),
                        }));
                        setBirthdayOpen(false);
                      }}
                      captionLayout="dropdown-buttons"
                      fromYear={currentYear - 100}
                      toYear={currentYear}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
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
