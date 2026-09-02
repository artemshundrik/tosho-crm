import * as React from "react";
import { CalendarIcon, User } from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

import { AvatarBase } from "@/components/app/avatar-kit";
import { CustomerLeadPicker, type CustomerLeadOption } from "@/components/customers";
import { Chip } from "@/components/ui/chip";
import { DateTimePicker } from "@/components/ui/picker-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { searchQuoteParties, type QuotePartyOption } from "@/features/quotes/quoteParties";
import { isInactiveEmployment } from "@/lib/employment";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";

/**
 * Шапка майбутнього прорахунку у тестовому візарді (REQ-134#p3).
 *
 * ЧОМУ ШАПКА ЙДЕ ДО ФАЙЛУ. Позиції з ексельки лягають У прорахунок, а він до
 * цієї миті не існує: замовника, менеджера й валюту однаково доведеться
 * спитати — питання лише, до чи після. До — значить, менеджер відповідає на
 * них, поки ще пам'ятає, звідки взявся файл.
 *
 * ЧОМУ ТУТ НЕМАЄ ТИПУ УГОДИ. Спершу я його додав — здавалось, що це і є те
 * «ще щось», чого Артем не пригадав, бо в білдері поле обов'язкове. Але шкала
 * Олени діє ЛИШЕ на поліграфії (`resolveQuoteDealType` віддає null на все
 * інше), а цим шляхом ідуть тільки мерчеві прорахунки: накрутка вийшла б ті
 * самі 40 % при будь-якій відповіді. Білдер із тієї ж причини ховає контрол,
 * поки в заході немає поліграфії.
 *
 * ЧОМУ КОМПОНЕНТ САМ ХОДИТЬ ПО ДАНІ. Альтернатива — протягнути сюди
 * замовників, пошук і склад команди пропсами зі сторінки прорахунків, тобто
 * дописати два десятки рядків у файл на вісім із половиною тисяч. Дані тут
 * рівно ті самі, що й у білдера, і беруться тими самими спільними модулями.
 */

export type QuoteWizardHeaderValue = {
  partyId: string;
  partyLabel: string;
  partyType: "customer" | "lead";
  partyLogoUrl: string | null;
  managerId: string;
  /** ISO-рядок або порожньо. Дедлайн необов'язковий — як і в білдері. */
  deadlineAt: string;
  currency: string;
};

export const createEmptyQuoteWizardHeader = (managerId: string): QuoteWizardHeaderValue => ({
  partyId: "",
  partyLabel: "",
  partyType: "customer",
  partyLogoUrl: null,
  managerId,
  deadlineAt: "",
  currency: "UAH",
});

/**
 * Чого бракує, щоб СТВОРИТИ. Порожньо — можна.
 *
 * Текст без згадки файлу навмисно: цю причину видно в підвалі за будь-якого
 * джерела позицій, і «позиції з файлу» звучало б дивно на позиції, введеній
 * руками.
 */
export function getQuoteWizardHeaderIssue(value: QuoteWizardHeaderValue): string | null {
  if (!value.partyId) return "Оберіть замовника — прорахунок створюється на нього.";
  if (!value.managerId) return "Оберіть менеджера прорахунку.";
  return null;
}

const CURRENCIES = ["UAH", "USD", "EUR"] as const;

type MemberOption = { id: string; label: string; avatarUrl: string | null };

export function QuoteWizardHeader({
  teamId,
  currentUserId,
  value,
  onChange,
  disabled,
  nudgeSignal = 0,
}: {
  teamId: string;
  currentUserId?: string | null;
  value: QuoteWizardHeaderValue;
  onChange: (next: QuoteWizardHeaderValue) => void;
  disabled?: boolean;
  /**
   * Лічильник «покажи, що бракує саме тут». Зростає, коли натиснули «Створити»
   * без замовника; зміна значення перезапускає анімацію через `key`.
   */
  nudgeSignal?: number;
}) {
  const [partySearch, setPartySearch] = React.useState("");
  const [parties, setParties] = React.useState<QuotePartyOption[]>([]);
  const [partiesLoading, setPartiesLoading] = React.useState(false);
  const [partyPickerOpen, setPartyPickerOpen] = React.useState(false);
  const [members, setMembers] = React.useState<MemberOption[]>([]);
  const [managerPopoverOpen, setManagerPopoverOpen] = React.useState(false);
  const [deadlineOpen, setDeadlineOpen] = React.useState(false);

  const patch = (next: Partial<QuoteWizardHeaderValue>) => onChange({ ...value, ...next });

  // Пошук замовників — із тією ж паузою в 250 мс, що й у білдері: без неї
  // кожна літера це два запити до бази.
  React.useEffect(() => {
    if (!teamId) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      setPartiesLoading(true);
      try {
        const rows = await searchQuoteParties(teamId, partySearch);
        if (alive) setParties(rows);
      } catch {
        if (alive) setParties([]);
      } finally {
        if (alive) setPartiesLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [partySearch, teamId]);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const workspaceId = currentUserId ? await resolveWorkspaceId(currentUserId) : null;
      const rows = workspaceId ? await listWorkspaceMembersForDisplay(workspaceId) : [];
      if (!alive) return;
      // Звільнених у список не пускаємо: прорахунок на людину, якої вже немає,
      // ніхто потім не знайде.
      setMembers(
        rows
          .filter((row) => !isInactiveEmployment(row.employmentStatus))
          .map((row) => ({ id: row.userId, label: row.label, avatarUrl: row.avatarDisplayUrl }))
      );
    })();
    return () => {
      alive = false;
    };
  }, [currentUserId]);

  const partyOptions = React.useMemo<CustomerLeadOption[]>(
    () =>
      parties.map((party) => ({
        id: party.id,
        label: party.name || party.legal_name || "Без назви",
        entityType: party.entityType ?? "customer",
        logoUrl: party.logo_url ?? null,
        legalName: party.legal_name ?? null,
        managerLabel: party.manager ?? null,
      })),
    [parties]
  );

  const manager = members.find((member) => member.id === value.managerId) ?? null;
  const deadlineDate = value.deadlineAt ? new Date(value.deadlineAt) : null;

  return (
    /*
      БЕЗ ПІДЛОЖКИ (REQ-237#p8). Рамка з фоном обіцяла форму — розділ, у якому
      щось заповнюють, — а всередині лежать чотири чіпи, кожен зі своїм
      вікном. Разом із плитками нижче це давало три обведені прямокутники
      поспіль перед вмістом. Чіпи самодостатні: вони й так видно.
    */
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span key={nudgeSignal} className={cn("inline-flex", nudgeSignal > 0 && "animate-control-nudge")}>
        <CustomerLeadPicker
          open={partyPickerOpen}
          onOpenChange={setPartyPickerOpen}
          selectedLabel={value.partyLabel}
          selectedType={value.partyType}
          selectedLogoUrl={value.partyLogoUrl}
          searchValue={partySearch}
          onSearchChange={setPartySearch}
          options={partyOptions}
          loading={partiesLoading}
          onSelect={(option) =>
            patch({
              partyId: option.id,
              partyLabel: option.label,
              partyType: option.entityType,
              partyLogoUrl: option.logoUrl ?? null,
            })
          }
          onClear={() =>
            patch({ partyId: "", partyLabel: "", partyType: "customer", partyLogoUrl: null })
          }
        />
        </span>

        <Popover open={managerPopoverOpen} onOpenChange={setManagerPopoverOpen}>
          <PopoverTrigger asChild>
            <Chip
              size="md"
              disabled={disabled}
              active={Boolean(manager)}
              icon={
                manager ? (
                  <AvatarBase src={manager.avatarUrl} name={manager.label} size={20} />
                ) : (
                  <User />
                )
              }
            >
              {manager?.label ?? "Менеджер"}
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  patch({ managerId: member.id });
                  setManagerPopoverOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm hover:bg-muted/60"
              >
                <AvatarBase src={member.avatarUrl} name={member.label} size={20} />
                <span className="truncate">{member.label}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <DateTimePicker
          value={deadlineDate}
          onChange={(next) => patch({ deadlineAt: next ? next.toISOString() : "" })}
          open={deadlineOpen}
          onOpenChange={setDeadlineOpen}
          trigger={
            <Chip size="md" icon={<CalendarIcon />} active={Boolean(deadlineDate)} disabled={disabled}>
              {deadlineDate ? format(deadlineDate, "d MMM, HH:mm", { locale: uk }) : "Дедлайн"}
            </Chip>
          }
        />

        <Select value={value.currency} onValueChange={(next) => patch({ currency: next })} disabled={disabled}>
          <SelectTrigger className="h-9 w-24 rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
