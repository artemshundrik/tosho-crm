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
import { AvatarBase } from "@/components/app/avatar-kit";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Building2,
  CalendarIcon,
  Check,
  Image as ImageIcon,
  Percent,
  PlusCircle,
  Trash2,
  User,
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
  manager: string;
  managerId: string;
  ownershipType: string;
  vatRate: string;
  taxId: string;
  website: string;
  iban: string;
  logoUrl: string;
  contacts: CustomerContact[];
  contactName: string;
  contactPosition: string;
  contactPhone: string;
  contactEmail: string;
  contactBirthday: string;
  signatoryName: string;
  signatoryPosition: string;
  reminderDate: string;
  reminderTime: string;
  reminderComment: string;
  eventName: string;
  eventDate: string;
  eventComment: string;
  notes: string;
};

export type CustomerContact = {
  name: string;
  position: string;
  phone: string;
  email: string;
  birthday: string;
};

export type CustomerLinkedItem = {
  id: string;
  number?: string | null;
  status?: string | null;
  total?: number | null;
  created_at?: string | null;
};

export type CustomerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CustomerFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerFormState>>;
  ownershipOptions: OwnershipOption[];
  vatOptions: VatOption[];
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
  calculations?: CustomerLinkedItem[];
  orders?: CustomerLinkedItem[];
  linkedLoading?: boolean;
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground">{children}</h4>
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
  "Адміністратор",
  "Маркетолог",
  "Керівник відділу маркетингу",
  "Директор з маркетингу",
  "Менеджер відділу закупівель",
  "Офіс-менеджер",
  "Секретар",
];

const normalizeTime = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";

  let hour = 0;
  let minute = 0;
  if (digits.length <= 2) {
    hour = Number(digits);
  } else if (digits.length === 3) {
    hour = Number(digits.slice(0, 1));
    minute = Number(digits.slice(1));
  } else {
    hour = Number(digits.slice(0, 2));
    minute = Number(digits.slice(2));
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  hour = Math.max(0, Math.min(23, hour));
  minute = Math.max(0, Math.min(59, minute));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const CustomerDialog: React.FC<CustomerDialogProps> = ({
  open,
  onOpenChange,
  form,
  setForm,
  ownershipOptions,
  vatOptions,
  teamMembers = [],
  saving = false,
  error,
  title = "Новий замовник",
  description = "Додайте всі дані замовника, щоб одразу підхопити їх у прорахунку.",
  submitLabel = "Створити клієнта",
  onSubmit,
  calculations = [],
  orders = [],
  linkedLoading = false,
}) => {
  const currentYear = React.useMemo(() => new Date().getFullYear(), []);
  const currentOwnership = ownershipOptions.find(
    (option) => option.value === form.ownershipType
  );
  const currentVat = vatOptions.find((option) => option.value === form.vatRate);
  const [ownershipOpen, setOwnershipOpen] = React.useState(false);
  const [vatOpen, setVatOpen] = React.useState(false);
  const [logoOpen, setLogoOpen] = React.useState(false);
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [reminderDateOpen, setReminderDateOpen] = React.useState(false);
  const [eventDateOpen, setEventDateOpen] = React.useState(false);
  const [section, setSection] = React.useState<"basic" | "requisites" | "communication" | "history">(
    "basic"
  );

  const reminderDateValue = React.useMemo(
    () => (form.reminderDate ? new Date(`${form.reminderDate}T00:00:00`) : undefined),
    [form.reminderDate]
  );
  const eventDateValue = React.useMemo(
    () => (form.eventDate ? new Date(`${form.eventDate}T00:00:00`) : undefined),
    [form.eventDate]
  );

  const selectedManager =
    teamMembers.find((member) => member.id === form.managerId) ??
    teamMembers.find((member) => member.label === form.manager);

  React.useEffect(() => {
    if (!open) {
      setOwnershipOpen(false);
      setVatOpen(false);
      setLogoOpen(false);
      setManagerOpen(false);
      setReminderDateOpen(false);
      setEventDateOpen(false);
    }
  }, [open]);

  const handleReminderTimeChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    const masked = digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
    setForm((prev) => ({ ...prev, reminderTime: masked }));
  };

  const handleReminderTimeBlur = () => {
    setForm((prev) => ({ ...prev, reminderTime: normalizeTime(prev.reminderTime) }));
  };

  const updateContact = (index: number, patch: Partial<CustomerContact>) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact, i) => (i === index ? { ...contact, ...patch } : contact)),
    }));
  };

  const addContact = () => {
    setForm((prev) => ({
      ...prev,
      contacts: [...prev.contacts, { name: "", position: "", phone: "", email: "", birthday: "" }],
    }));
  };

  const removeContact = (index: number) => {
    setForm((prev) => {
      if (prev.contacts.length <= 1) return prev;
      return { ...prev, contacts: prev.contacts.filter((_, i) => i !== index) };
    });
  };

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
                {currentVat?.value === "none" ? "ПДВ" : (currentVat?.label ?? "ПДВ")}
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
                {teamMembers.length > 0 ? (
                  teamMembers.map((member) => (
                    <Button
                      key={member.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 h-9 text-sm truncate"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, manager: member.label, managerId: member.id }));
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
                    </Button>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground p-2">Немає менеджерів</div>
                )}
                {form.manager.trim() ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm text-muted-foreground"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, manager: "", managerId: "" }));
                      setManagerOpen(false);
                    }}
                  >
                    Очистити
                  </Button>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="rounded-md border border-border/50 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
          {[form.name || "Без назви", form.manager || "Без менеджера", form.reminderDate || "Без нагадування"]
            .filter(Boolean)
            .join(" • ")}
        </div>

        <div className="space-y-3">
          <Tabs value={section} onValueChange={(value) => setSection(value as typeof section)} className="w-full">
            <TabsList className={cn("w-fit", SEGMENTED_GROUP_SM)}>
              <TabsTrigger value="basic" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>Основне</TabsTrigger>
              <TabsTrigger value="requisites" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>Реквізити</TabsTrigger>
              <TabsTrigger value="communication" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>Комунікація</TabsTrigger>
              <TabsTrigger value="history" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>Історія</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-3 mt-3">
              <SectionHeader>Компанія</SectionHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    <Label>Сайт</Label>
                    <Input
                      value={form.website}
                      onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                      placeholder="https://"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              <SectionHeader>Контакти</SectionHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Додайте кілька контактів: імʼя, номер, посада, email.
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addContact}>
                    <PlusCircle className="mr-1 h-4 w-4" />
                    Додати контакт
                  </Button>
                </div>
                {form.contacts.map((contact, index) => (
                  <div key={`customer-contact-${index}`} className="space-y-3 rounded-lg border border-border/50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">Контакт {index + 1}</div>
                      {form.contacts.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeContact(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Імʼя контакту</Label>
                        <Input
                          value={contact.name}
                          onChange={(e) => updateContact(index, { name: e.target.value })}
                          placeholder="Імʼя та прізвище"
                          className="h-9"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Посада</Label>
                        <Select
                          value={contact.position}
                          onValueChange={(value) => updateContact(index, { position: value })}
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
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Номер телефону</Label>
                        <Input
                          value={contact.phone}
                          onChange={(e) => updateContact(index, { phone: e.target.value })}
                          placeholder="+380..."
                          className="h-9"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={contact.email}
                          onChange={(e) => updateContact(index, { email: e.target.value })}
                          placeholder="name@company.com"
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>День народження</Label>
                      <Input
                        type="date"
                        value={contact.birthday}
                        onChange={(e) => updateContact(index, { birthday: e.target.value })}
                        className="h-9"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="requisites" className="space-y-3 mt-3">
              <SectionHeader>Реквізити</SectionHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>IBAN</Label>
                    <Input
                      value={form.iban}
                      onChange={(e) => setForm((prev) => ({ ...prev, iban: e.target.value }))}
                      placeholder="UA..."
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Підписант</Label>
                    <Input
                      value={form.signatoryName}
                      onChange={(e) => setForm((prev) => ({ ...prev, signatoryName: e.target.value }))}
                      placeholder="ПІБ підписанта"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Посада підписанта</Label>
                  <Input
                    value={form.signatoryPosition}
                    onChange={(e) => setForm((prev) => ({ ...prev, signatoryPosition: e.target.value }))}
                    placeholder="Напр. Директор"
                    className="h-9"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="communication" className="space-y-3 mt-3">
              <SectionHeader>Нагадування</SectionHeader>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Дата</Label>
                  <Popover open={reminderDateOpen} onOpenChange={setReminderDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "h-9 w-full justify-start px-3 text-sm font-normal",
                          !form.reminderDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {form.reminderDate && reminderDateValue
                          ? format(reminderDateValue, "d MMM yyyy", { locale: uk })
                          : "Оберіть дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={reminderDateValue}
                        onSelect={(date) => {
                          setForm((prev) => ({
                            ...prev,
                            reminderDate: date ? format(date, "yyyy-MM-dd") : "",
                          }));
                          setReminderDateOpen(false);
                        }}
                        captionLayout="dropdown-buttons"
                        fromYear={currentYear - 3}
                        toYear={currentYear + 5}
                        initialFocus
                      />
                      <DateQuickActions
                        onSelect={(date) => {
                          setForm((prev) => ({
                            ...prev,
                            reminderDate: date ? format(date, "yyyy-MM-dd") : "",
                          }));
                          setReminderDateOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2">
                  <Label>Час</Label>
                  <Input
                    value={form.reminderTime}
                    onChange={(e) => handleReminderTimeChange(e.target.value)}
                    onBlur={handleReminderTimeBlur}
                    placeholder="HH:MM"
                    inputMode="numeric"
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2 col-span-2">
                  <Label>Коментар нагадування</Label>
                  <Textarea
                    value={form.reminderComment}
                    onChange={(e) => setForm((prev) => ({ ...prev, reminderComment: e.target.value }))}
                    placeholder="Що треба зробити"
                    className="min-h-16"
                  />
                </div>
              </div>

              <SectionHeader>Подія</SectionHeader>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Назва події</Label>
                  <Input
                    value={form.eventName}
                    onChange={(e) => setForm((prev) => ({ ...prev, eventName: e.target.value }))}
                    placeholder="Річниця, конференція, захід..."
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Дата події</Label>
                  <Popover open={eventDateOpen} onOpenChange={setEventDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "h-9 w-full justify-start px-3 text-sm font-normal",
                          !form.eventDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {form.eventDate && eventDateValue
                          ? format(eventDateValue, "d MMM yyyy", { locale: uk })
                          : "Оберіть дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={eventDateValue}
                        onSelect={(date) => {
                          setForm((prev) => ({
                            ...prev,
                            eventDate: date ? format(date, "yyyy-MM-dd") : "",
                          }));
                          setEventDateOpen(false);
                        }}
                        captionLayout="dropdown-buttons"
                        fromYear={currentYear - 3}
                        toYear={currentYear + 5}
                        initialFocus
                      />
                      <DateQuickActions
                        onSelect={(date) => {
                          setForm((prev) => ({
                            ...prev,
                            eventDate: date ? format(date, "yyyy-MM-dd") : "",
                          }));
                          setEventDateOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2 col-span-2">
                  <Label>Коментар події</Label>
                  <Textarea
                    value={form.eventComment}
                    onChange={(e) => setForm((prev) => ({ ...prev, eventComment: e.target.value }))}
                    placeholder="Контекст події"
                    className="min-h-16"
                  />
                </div>
              </div>

              <SectionHeader>Коментарі</SectionHeader>
              <div className="grid gap-2">
                <Label>Загальні коментарі</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Що замовляє, коли, важливі деталі комунікації..."
                  className="min-h-16"
                />
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-3 mt-3">
              <SectionHeader>Історія</SectionHeader>
              <Tabs defaultValue="calculations" className="w-full">
                <TabsList className={cn("w-fit", SEGMENTED_GROUP_SM)}>
                  <TabsTrigger value="calculations" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>Прорахунки</TabsTrigger>
                  <TabsTrigger value="orders" className={cn(SEGMENTED_TRIGGER_SM, "px-2.5 text-xs")}>Замовлення</TabsTrigger>
                </TabsList>
                <TabsContent value="calculations" className="mt-3">
                  {linkedLoading ? (
                    <div className="text-sm text-muted-foreground">Завантаження...</div>
                  ) : calculations.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Поки немає прорахунків.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {calculations.map((row) => (
                        <div key={row.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/40 px-2 py-1.5 text-sm">
                          <div className="truncate font-medium">{row.number ?? "Без номера"}</div>
                          <div className="text-xs text-muted-foreground">{row.status ?? "new"}</div>
                          <div className="text-xs text-muted-foreground">{row.created_at ? new Date(row.created_at).toLocaleDateString("uk-UA") : "без дати"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="orders" className="mt-3">
                  {linkedLoading ? (
                    <div className="text-sm text-muted-foreground">Завантаження...</div>
                  ) : orders.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Поки немає замовлень.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {orders.map((row) => (
                        <div key={row.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/40 px-2 py-1.5 text-sm">
                          <div className="truncate font-medium">{row.number ?? "Без номера"}</div>
                          <div className="text-xs text-muted-foreground">{row.status ?? "approved"}</div>
                          <div className="text-xs text-muted-foreground">{row.created_at ? new Date(row.created_at).toLocaleDateString("uk-UA") : "без дати"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>

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
