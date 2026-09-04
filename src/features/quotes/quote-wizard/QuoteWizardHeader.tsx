import * as React from "react";
import { Building2, CalendarIcon, Coins, User } from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

import { AvatarBase } from "@/components/app/avatar-kit";
import { CustomerLeadPicker, type CustomerLeadOption } from "@/components/customers";
import { Chip } from "@/components/ui/chip";
import { DateTimePicker } from "@/components/ui/picker-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDeadlineDate, toWallClockValue } from "@/features/quotes/quote-details/deadlineLabels";
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
  layout = "row",
}: {
  teamId: string;
  currentUserId?: string | null;
  value: QuoteWizardHeaderValue;
  onChange: (next: QuoteWizardHeaderValue) => void;
  disabled?: boolean;
  /**
   * `row` — чіпи в один рядок (як було). `column` — стовпчик підписаних полів
   * для лівої панелі вікна (REQ-182#p20, прототип Б): підпис дрібними літерами
   * над контролом, контрол на всю ширину, дедлайн і валюта в одному рядку.
   */
  layout?: "row" | "column";
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
  // Читаємо тією самою конвенцією, якою пишемо: дедлайн — настінний час, і
  // `new Date(...)` перерахував би його з фіктивного «+00» у зону браузера.
  const deadlineDate = parseDeadlineDate(value.deadlineAt);

  const partyPicker = (
    <span key={nudgeSignal} className={cn("inline-flex min-w-0", layout === "column" && "w-full", nudgeSignal > 0 && "animate-control-nudge")}>
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
        chipLabel={layout === "column" ? "Оберіть замовника або ліда" : undefined}
        onSelect={(option) =>
          patch({
            partyId: option.id,
            partyLabel: option.label,
            partyType: option.entityType,
            partyLogoUrl: option.logoUrl ?? null,
          })
        }
        onClear={() => patch({ partyId: "", partyLabel: "", partyType: "customer", partyLogoUrl: null })}
      />
    </span>
  );

  const managerPicker = (
    <Popover open={managerPopoverOpen} onOpenChange={setManagerPopoverOpen}>
      <PopoverTrigger asChild>
        <Chip
          size="md"
          disabled={disabled}
          active={Boolean(manager)}
          icon={manager ? <AvatarBase src={manager.avatarUrl} name={manager.label} size={20} /> : <User />}
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
  );

  const deadlinePicker = (
    <DateTimePicker
      value={deadlineDate}
      // НЕ toISOString(): дедлайни зберігаються настінним часом (див.
      // шапку deadlineLabels.ts). Через toISOString() обраний менеджером
      // час їхав у базу зсунутим на різницю поясів, і картка показувала
      // не те, що він щойно поставив.
      onChange={(next) => patch({ deadlineAt: toWallClockValue(next) })}
      open={deadlineOpen}
      onOpenChange={setDeadlineOpen}
      trigger={
        <Chip size="md" icon={<CalendarIcon />} active={Boolean(deadlineDate)} disabled={disabled}>
          {deadlineDate ? format(deadlineDate, "d MMM, HH:mm", { locale: uk }) : "Дедлайн"}
        </Chip>
      }
    />
  );

  const currencyPicker = (
    <Select value={value.currency} onValueChange={(next) => patch({ currency: next })} disabled={disabled}>
      <SelectTrigger className={cn("h-9 rounded-full", layout === "column" ? "w-full rounded-lg" : "w-24")}>
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
  );

  if (layout === "column") {
    /*
      ЛІВА ПАНЕЛЬ (REQ-182#p20). Ті самі чіпи, що в рядку, але кожен стоїть
      під своїм підписом і на всю ширину: у стовпчику 272 px чіп без підпису
      читався б як кнопка, а не як відповідь на питання «для кого».
      Дедлайн і валюта — в один рядок: обидва короткі, і валюта майже завжди
      UAH.
    */
    return (
      <div className="flex flex-col gap-3">
        <HeaderField label="Замовник / Лід" icon={Building2}>
          {partyPicker}
        </HeaderField>
        <HeaderField label="Менеджер" icon={User}>
          {managerPicker}
        </HeaderField>
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
          <HeaderField label="Дедлайн" icon={CalendarIcon}>
            {deadlinePicker}
          </HeaderField>
          <HeaderField label="Валюта" icon={Coins}>
            {currencyPicker}
          </HeaderField>
        </div>
      </div>
    );
  }

  return (
    /*
      БЕЗ ПІДЛОЖКИ (REQ-237#p8). Рамка з фоном обіцяла форму — розділ, у якому
      щось заповнюють, — а всередині лежать чотири чіпи, кожен зі своїм
      вікном. Разом із плитками нижче це давало три обведені прямокутники
      поспіль перед вмістом. Чіпи самодостатні: вони й так видно.
    */
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {partyPicker}
        {managerPicker}
        {deadlinePicker}
        {currencyPicker}
      </div>
    </div>
  );
}

/**
 * Підпис над контролом у стовпчику. Контрол усередині розтягується на всю
 * ширину й отримує кут 8 px замість пігулки — у стовпчику підписаних полів
 * пігулка виглядає як кнопка, а тут це поле.
 */
function HeaderField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3 text-muted-foreground/70" />
        {label}
      </span>
      <div className="min-w-0 [&_button]:w-full [&_button]:max-w-none [&_button]:justify-start [&_button]:rounded-lg">{children}</div>
    </div>
  );
}
