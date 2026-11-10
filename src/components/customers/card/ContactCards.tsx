import { EntityAvatar } from "@/components/app/avatar-kit";
import { Mail, Phone, Send, Trash2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { EmailInput } from "@/components/ui/email-input";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { TelegramInput } from "@/components/ui/telegram-input";
import { cn } from "@/lib/utils";
import { formatBirthdayForInput, normalizeBirthdayInput } from "../contactBirthday";
import type { CustomerContact } from "../partyFormTypes";
import { POSITION_OPTIONS } from "../positionOptions";
import { INLINE_CONTROL, INLINE_NEED } from "./CardParts";

/**
 * Контакти картками в сітку `auto-fill, minmax(260px)`: кожне поле правиться
 * на місці, остання картка — «+ Додати контакт». Перший контакт — основний:
 * його телефон рахується в «Для рахунку».
 */

export const EMPTY_CONTACT: CustomerContact = { name: "", position: "", phone: "", email: "", birthday: "", telegram: "" };
export const contactFieldId = (index: number, field: "name" | "phone" | "email") => `contact-${index}-${field}`;

const ROW = "flex items-center gap-2 text-muted-foreground";

export function ContactCards(props: {
  contacts: CustomerContact[];
  /** Телефону основного контакту бракує для рахунку — підсвічуємо. */
  needPhone?: boolean;
  onPatch: (index: number, patch: Partial<CustomerContact>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const contacts = props.contacts.length ? props.contacts : [EMPTY_CONTACT];
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
      <datalist id="contact-positions">
        {POSITION_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {contacts.map((contact, index) => (
        <div key={index} data-testid="contact-card" className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <EntityAvatar name={contact.name || contact.phone || "?"} size={32} />
            <div className="min-w-0 flex-1">
              <Input
                id={contactFieldId(index, "name")}
                aria-label="Імʼя"
                value={contact.name}
                placeholder="Імʼя та прізвище"
                controlSize="sm"
                className={cn(INLINE_CONTROL, "font-semibold")}
                onChange={(event) => props.onPatch(index, { name: event.target.value })}
              />
              <Input
                aria-label="Посада"
                list="contact-positions"
                value={contact.position}
                placeholder="Посада"
                controlSize="sm"
                className={cn(INLINE_CONTROL, "text-xs text-muted-foreground")}
                onChange={(event) => props.onPatch(index, { position: event.target.value })}
              />
            </div>
            {index === 0 ? (
              <span className="shrink-0 self-start rounded-full bg-info-soft px-2 py-0.5 text-2xs font-medium text-info-foreground">основний</span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="iconXs"
                className="shrink-0 self-start"
                aria-label={`Прибрати контакт ${contact.name || index + 1}`}
                onClick={() => props.onRemove(index)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
          <div className={ROW}>
            <Phone className="size-4 shrink-0" />
            <PhoneInput
              id={contactFieldId(index, "phone")}
              value={contact.phone}
              className={cn(INLINE_CONTROL, "flex-1 text-foreground", index === 0 && props.needPhone && INLINE_NEED)}
              onChange={(phone) => props.onPatch(index, { phone })}
            />
          </div>
          <div className={ROW}>
            <Mail className="size-4 shrink-0" />
            <EmailInput
              id={contactFieldId(index, "email")}
              value={contact.email}
              placeholder="Email"
              className={cn(INLINE_CONTROL, "flex-1 text-foreground")}
              onChange={(email) => props.onPatch(index, { email })}
            />
          </div>
          <div className={ROW}>
            <Send className="size-4 shrink-0" />
            <TelegramInput
              value={contact.telegram}
              placeholder="Telegram"
              className={cn(INLINE_CONTROL, "flex-1 text-foreground")}
              onChange={(telegram) => props.onPatch(index, { telegram })}
            />
          </div>
          <Input
            aria-label="День народження"
            value={formatBirthdayForInput(contact.birthday)}
            inputMode="numeric"
            maxLength={10}
            placeholder="День народження: дд.мм"
            controlSize="sm"
            className={cn(INLINE_CONTROL, "text-xs")}
            onChange={(event) => props.onPatch(index, { birthday: normalizeBirthdayInput(event.target.value) })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={props.onAdd}
        className="min-h-[120px] rounded-lg border border-dashed border-line-strong text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        + Додати контакт
      </button>
    </div>
  );
}
