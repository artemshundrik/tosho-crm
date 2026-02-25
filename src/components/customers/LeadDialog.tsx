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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { AvatarBase } from "@/components/app/avatar-kit";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { CalendarIcon, Check, Image as ImageIcon, PlusCircle, Trash2, User, UserPlus } from "lucide-react";

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
  iban: string;
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

export type LeadLinkedItem = {
  id: string;
  number?: string | null;
  status?: string | null;
  total?: number | null;
  created_at?: string | null;
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
  calculations?: LeadLinkedItem[];
  orders?: LeadLinkedItem[];
  linkedLoading?: boolean;
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
  calculations = [],
  orders = [],
  linkedLoading = false,
}) => {
  const [logoOpen, setLogoOpen] = React.useState(false);
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [reminderDateOpen, setReminderDateOpen] = React.useState(false);
  const [eventDateOpen, setEventDateOpen] = React.useState(false);
  const [quickMode, setQuickMode] = React.useState(true);
  const [section, setSection] = React.useState<"basic" | "requisites" | "communication" | "history">(
    "basic"
  );
  const currentYear = React.useMemo(() => new Date().getFullYear(), []);

  const hasManagerInList = teamMembers.some((member) => member.label === form.manager);
  const selectedManager = teamMembers.find((member) => member.label === form.manager);
  const reminderDateValue = React.useMemo(
    () => (form.reminderDate ? new Date(`${form.reminderDate}T00:00:00`) : undefined),
    [form.reminderDate]
  );
  const eventDateValue = React.useMemo(
    () => (form.eventDate ? new Date(`${form.eventDate}T00:00:00`) : undefined),
    [form.eventDate]
  );

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

  const handleReminderTimeChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    const masked = digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
    setForm((prev) => ({ ...prev, reminderTime: masked }));
  };

  const handleReminderTimeBlur = () => {
    setForm((prev) => ({ ...prev, reminderTime: normalizeTime(prev.reminderTime) }));
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
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-2">
            <span className="text-xs text-muted-foreground">Режим форми</span>
            <div className="inline-flex items-center gap-1 rounded-md bg-background p-1">
              <Button
                type="button"
                size="sm"
                variant={quickMode ? "secondary" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setQuickMode(true);
                  setSection("basic");
                }}
              >
                Швидко
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!quickMode ? "secondary" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={() => setQuickMode(false)}
              >
                Повна картка
              </Button>
            </div>
          </div>

          {quickMode ? (
            <div className="space-y-4">
              <SectionHeader>Основне</SectionHeader>
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
                    <Label>Джерело *</Label>
                    <Input
                      value={form.source}
                      onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                      placeholder="Звідки отримали контакт"
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
                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={addPhone}>
                        <PlusCircle className="mr-1 h-4 w-4" />
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
              <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => setQuickMode(false)}>
                Відкрити повну картку
              </Button>
            </div>
          ) : (
            <Tabs value={section} onValueChange={(value) => setSection(value as typeof section)} className="w-full">
              <TabsList className="sticky top-0 z-10 w-full justify-start bg-card/95 backdrop-blur">
                <TabsTrigger value="basic">Основне</TabsTrigger>
                <TabsTrigger value="requisites">Реквізити</TabsTrigger>
                <TabsTrigger value="communication">Комунікація</TabsTrigger>
                <TabsTrigger value="history">Історія</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
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
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={addPhone}>
                          <PlusCircle className="mr-1 h-4 w-4" />
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
              </TabsContent>

              <TabsContent value="requisites" className="space-y-4 mt-4">
                <SectionHeader>Реквізити</SectionHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
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

              <TabsContent value="communication" className="space-y-4 mt-4">
                <SectionHeader>Нагадування</SectionHeader>
                <div className="grid grid-cols-2 gap-4">
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
                      className="min-h-20"
                    />
                  </div>
                </div>

                <SectionHeader>Подія</SectionHeader>
                <div className="grid grid-cols-2 gap-4">
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
                      className="min-h-20"
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
                    className="min-h-24"
                  />
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-4 mt-4">
                <SectionHeader>Історія</SectionHeader>
                <Tabs defaultValue="calculations" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="calculations">Прорахунки</TabsTrigger>
              <TabsTrigger value="orders">Замовлення</TabsTrigger>
            </TabsList>
            <TabsContent value="calculations" className="mt-3">
              {linkedLoading ? (
                <div className="text-sm text-muted-foreground">Завантаження...</div>
              ) : calculations.length === 0 ? (
                <div className="text-sm text-muted-foreground">Поки немає прорахунків.</div>
              ) : (
                <div className="space-y-2">
                  {calculations.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border/50 px-3 py-2 text-sm">
                      <div className="font-medium">{row.number ?? "Без номера"}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.status ?? "new"} · {row.created_at ? new Date(row.created_at).toLocaleDateString("uk-UA") : "без дати"}
                      </div>
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
                <div className="space-y-2">
                  {orders.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border/50 px-3 py-2 text-sm">
                      <div className="font-medium">{row.number ?? "Без номера"}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.status ?? "approved"} · {row.created_at ? new Date(row.created_at).toLocaleDateString("uk-UA") : "без дати"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
                </Tabs>
              </TabsContent>
            </Tabs>
          )}

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
