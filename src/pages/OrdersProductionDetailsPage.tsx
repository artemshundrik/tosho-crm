import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ORDER_STATUS_SECTIONS } from "@/features/orders/config";
import {
  formatOrderDate,
  formatOrderMoney,
  loadDerivedOrders,
  updateOrderStatuses,
  type OrderDesignAsset,
  type DerivedOrderRecord,
} from "@/features/orders/orderRecords";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Mail,
  Palette,
  Phone,
  Send,
  Wallet,
} from "lucide-react";

const getInitials = (value?: string | null) => {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
};

const renderDocBadge = (label: string, ready: boolean) => (
  <Badge
    variant="outline"
    className={cn(
      "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
      ready
        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
        : "border-border/70 bg-muted/20 text-muted-foreground"
    )}
  >
    {label}
  </Badge>
);

const renderDesignAssetList = (title: string, assets: OrderDesignAsset[]) => (
  <div className="rounded-lg border border-border/60 bg-muted/[0.04] p-3">
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">
        {assets.length}
      </Badge>
    </div>
    {assets.length === 0 ? (
      <div className="mt-2 text-sm text-muted-foreground">Немає погоджених матеріалів</div>
    ) : (
      <div className="mt-2 space-y-2">
        {assets.map((asset) => (
          <div
            key={`${title}:${asset.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{asset.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {asset.kind === "file" ? "Файл" : "Посилання"}
                {asset.createdAt ? ` • ${formatOrderDate(asset.createdAt)}` : ""}
              </div>
            </div>
            {asset.url ? (
              <Button size="sm" variant="outline" asChild>
                <a href={asset.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Відкрити
                </a>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                Немає URL
              </Button>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

type OrderDocumentKind = "contract" | "invoice" | "specification" | "techCard";

const escapeHtml = (value?: string | number | null) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const documentTitleByKind: Record<OrderDocumentKind, string> = {
  contract: "Договір",
  invoice: "Рахунок",
  specification: "Специфікація",
  techCard: "Технологічний додаток",
};

const CONTRACT_EXECUTOR = {
  companyName: 'Товариство з обмеженою відповідальністю «АВАНПРІНТ»',
  shortName: "ТОВ «АВАНПРІНТ»",
  signatory: "Борщ Олена Вікторівна",
  signatoryPosition: "директора",
  authority: "Статуту",
  address: "Україна, 03035, м. Київ, вул. Монастирського Дениса, буд. 3, корпус 3",
  taxId: "43024297",
  vatId: "430242926591",
  iban: "UA233003350000000026006645092",
  bank: 'АТ «РАЙФФАЙЗЕН БАНК АВАЛЬ» в м. Києві',
  taxStatus: "Є платником ПДВ на загальних підставах.",
  signatureLabel: "О.В. Борщ",
};

const formatContractDateParts = (value?: string | null) => {
  const source = value ? new Date(value) : new Date();
  const date = Number.isNaN(source.getTime()) ? new Date() : source;
  const monthLabel = date.toLocaleDateString("uk-UA", { month: "long" });
  return {
    day: String(date.getDate()).padStart(2, "0"),
    monthLabel,
    year: String(date.getFullYear()),
    city: "м. Київ",
  };
};

const formatContractEndDate = (value?: string | null) => {
  const source = value ? new Date(value) : new Date();
  const date = Number.isNaN(source.getTime()) ? new Date() : source;
  date.setFullYear(date.getFullYear() + 1);
  return date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const buildOrderDocumentHtml = (record: DerivedOrderRecord, kind: OrderDocumentKind) => {
  const title = documentTitleByKind[kind];
  const contractDate = formatContractDateParts(record.updatedAt ?? record.createdAt);
  const contractEndDate = formatContractEndDate(record.updatedAt ?? record.createdAt);
  const customerTitle = record.legalEntityLabel || record.customerName;
  const customerSignatoryName =
    record.signatoryLabel?.split(",")[0]?.trim() || "Не вказано";
  const customerSignatoryRole =
    record.signatoryLabel?.split(",").slice(1).join(",").trim() || "уповноваженої особи";
  const rows = record.items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.unit)}</td>
          <td class="num">${escapeHtml(item.qty.toLocaleString("uk-UA"))}</td>
          <td class="num">${escapeHtml(formatOrderMoney(item.unitPrice, record.currency))}</td>
          <td class="num">${escapeHtml(formatOrderMoney(item.lineTotal, record.currency))}</td>
        </tr>`
    )
    .join("");

  if (kind === "contract") {
    return `<!doctype html>
    <html lang="uk">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)} ${escapeHtml(record.quoteNumber)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 0; line-height: 1.45; background: #f3f4f6; }
          .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 24px; background: rgba(255,255,255,0.96); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(8px); }
          .toolbar-title { font-size: 14px; color: #4b5563; }
          .toolbar-actions { display: flex; gap: 12px; }
          .toolbar-button { border: 1px solid #d1d5db; background: #ffffff; color: #111827; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
          .toolbar-button.primary { background: #111827; border-color: #111827; color: #ffffff; }
          .page { max-width: 960px; margin: 24px auto; background: #ffffff; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); padding: 36px; }
          h1 { font-size: 24px; text-align: center; margin: 0; }
          h2 { font-size: 16px; text-align: center; margin: 2px 0 18px; font-weight: 600; }
          h3 { font-size: 15px; margin: 20px 0 10px; font-weight: 700; text-transform: uppercase; }
          p { margin: 0 0 10px; font-size: 14px; }
          ul { margin: 0 0 10px 20px; padding: 0; }
          li { margin: 0 0 6px; font-size: 14px; }
          .topline { display: flex; justify-content: space-between; gap: 24px; margin: 14px 0 16px; font-size: 14px; }
          .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 24px; }
          .party-card { border-top: 1px solid #cbd5e1; padding-top: 14px; }
          .party-title { font-weight: 700; margin-bottom: 10px; }
          .signature { margin-top: 18px; }
          .muted { color: #6b7280; }
          @media print {
            body { background: #ffffff; }
            .toolbar { display: none; }
            .page { max-width: none; margin: 0; box-shadow: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <div class="toolbar-title">Договір ${escapeHtml(record.quoteNumber)}</div>
          <div class="toolbar-actions">
            <button class="toolbar-button" type="button" onclick="window.close()">Закрити</button>
            <button class="toolbar-button primary" type="button" onclick="window.print()">Зберегти PDF / Друк</button>
          </div>
        </div>
        <div class="page">
        <h1>ДОГОВІР № ${escapeHtml(record.quoteNumber)}</h1>
        <h2>на виготовлення та поставку рекламно-сувенірної продукції</h2>
        <div class="topline">
          <div>${escapeHtml(contractDate.city)}</div>
          <div>«${escapeHtml(contractDate.day)}» ${escapeHtml(contractDate.monthLabel)} ${escapeHtml(contractDate.year)} р.</div>
        </div>

        <p>${escapeHtml(CONTRACT_EXECUTOR.companyName)} (надалі – Виконавець), в особі ${escapeHtml(CONTRACT_EXECUTOR.signatoryPosition)} ${escapeHtml(CONTRACT_EXECUTOR.signatory)}, яка діє на підставі ${escapeHtml(CONTRACT_EXECUTOR.authority)}, з однієї сторони, та ${escapeHtml(customerTitle)} (надалі – Замовник), в особі ${escapeHtml(customerSignatoryRole)} ${escapeHtml(customerSignatoryName)}, яка діє на підставі Статуту, з іншої сторони (надалі – Сторони), уклали цей Договір про наступне:</p>

        <h3>1. Предмет договору</h3>
        <p>Виконавець зобов’язується виготовити та поставити Замовнику рекламно-сувенірну продукцію (надалі – Продукція) в асортименті, кількості та по ціні згідно Специфікаціям, що є невід’ємними частинами цього Договору, а Замовник зобов’язується прийняти Продукцію та оплатити її в порядку та на умовах, визначених Договором.</p>
        <p>На кожне окреме замовлення (партію) Продукції оформлюється Специфікація, в якій зазначається:</p>
        <ul>
          <li>кількість Продукції;</li>
          <li>назва Продукції;</li>
          <li>технічні параметри продукції згідно затверджених макетів та візуалів;</li>
          <li>умови та терміни оплати конкретної партії Продукції;</li>
          <li>строк виготовлення та поставки Продукції Замовнику.</li>
        </ul>

        <h3>2. Порядок виконання, здачі та приймання виконаних робіт</h3>
        <p>2.1. Виготовлення Продукції здійснюється партіями відповідно до наданих Замовником і затверджених ним макетів Продукції, підписаних уповноваженою особою Замовника.</p>
        <p>2.2. Поставка здійснюється на склад Замовника. Термін поставки Продукції становить не більше 50 (п’ятдесяти) робочих днів з моменту погодження Сторонами та затвердження Замовником оригінал-макету і здійснення передоплати, залежно від події, що наступить пізніше. Якщо на конкретну партію Продукції встановлені інші умови поставки, то вони зазначаються у Специфікації на відповідну партію замовлення.</p>
        <p>2.3. Датою поставки вважається дата фактичної передачі Продукції Замовнику, що зазначається в накладних на виготовлену Продукцію.</p>
        <p>2.4. Приймання Продукції за кількістю та якістю здійснюється сторонами в порядку, що визначається чинним законодавством України.</p>

        <h3>3. Вартість робіт по договору та порядок розрахунків</h3>
        <p>3.1. Перелік робіт та цін визначаються у Специфікаціях до цього Договору.</p>
        <p>3.2. Оплата за цим Договором здійснюється шляхом перерахування на розрахунковий рахунок Виконавця грошових коштів в національній валюті України, відповідно до умов кожної Специфікації.</p>
        <p>3.3. Зміна вартості робіт по виготовленню Продукції та умов оплати можлива лише за згодою Сторін, що оформляється шляхом підписання Сторонами Додаткової угоди до Специфікації.</p>

        <h3>4. Права та обов’язки сторін</h3>
        <p>4.1. Замовник зобов’язується своєчасно здійснювати розрахунки з Виконавцем за Договором.</p>
        <p>4.2. Замовник має право контролювати якість виконуваних робіт на їх відповідність погодженим Сторонами Специфікаціям.</p>
        <p>4.3. Виконавець зобов’язується виконувати роботи по виготовленню Продукції згідно Специфікаціям та з додержанням вимог діючих державних стандартів і технічних умов.</p>
        <p>4.4. Виконавець має право вимагати оплати Замовником вартості робіт в порядку та строки, визначені цим Договором.</p>

        <h3>5. Відповідальність сторін</h3>
        <p>5.1. У випадку порушення умов даного Договору Сторони несуть відповідальність відповідно до чинного законодавства України та даного Договору.</p>
        <p>5.2. За несвоєчасну поставку виготовленої Продукції Виконавець сплачує Замовнику пеню в розмірі подвійної облікової ставки НБУ від вартості несвоєчасно поставленої Продукції за кожен день прострочення.</p>
        <p>5.3. У випадку порушення Замовником строків оплати, передбачених у відповідних Специфікаціях, Замовник сплачує Виконавцю штраф в розмірі 5% від суми заборгованості.</p>

        <h3>6. Форс-мажор</h3>
        <p>6.1. Сторони звільняються від відповідальності за повне або часткове невиконання своїх зобов’язань по даному Договору, якщо воно викликано обставинами непереборної сили відповідно до чинного законодавства України.</p>

        <h3>7. Врегулювання суперечок</h3>
        <p>7.1. Всі суперечки між сторонами з приводу виконання даного договору вирішуються шляхом переговорів. У випадку недосягнення згоди спірне питання підлягає вирішенню в Господарському суді згідно чинного законодавства України.</p>

        <h3>8. Інші умови</h3>
        <p>8.1. Цей Договір складений українською мовою у двох автентичних примірниках, які мають однакову юридичну силу, по одному для кожної із Сторін.</p>
        <p>8.2. Цей Договір вважається укладеним і набирає чинності з моменту його підписання Сторонами.</p>
        <p>8.3. Додатки до цього Договору є його невід'ємними частинами і мають юридичну силу у разі, якщо вони викладені у письмовій формі та підписані Сторонами.</p>
        <p>8.4. Термін дії Договору до ${escapeHtml(contractEndDate)} року та/або до повного виконання Сторонами своїх зобов’язань.</p>

        <h3>9. Адреси і реквізити сторін</h3>
        <div class="party-grid">
          <div class="party-card">
            <div class="party-title">ВИКОНАВЕЦЬ</div>
            <p>${escapeHtml(CONTRACT_EXECUTOR.companyName)}</p>
            <p>${escapeHtml(CONTRACT_EXECUTOR.address)}</p>
            <p>Код ЄДРПОУ: ${escapeHtml(CONTRACT_EXECUTOR.taxId)}</p>
            <p>ІПН: ${escapeHtml(CONTRACT_EXECUTOR.vatId)}</p>
            <p>IBAN: ${escapeHtml(CONTRACT_EXECUTOR.iban)}</p>
            <p>${escapeHtml(CONTRACT_EXECUTOR.bank)}</p>
            <p>${escapeHtml(CONTRACT_EXECUTOR.taxStatus)}</p>
            <p class="signature">${escapeHtml(CONTRACT_EXECUTOR.signatoryPosition)} ____________________ ${escapeHtml(CONTRACT_EXECUTOR.signatureLabel)}</p>
          </div>
          <div class="party-card">
            <div class="party-title">ЗАМОВНИК</div>
            <p>${escapeHtml(customerTitle)}</p>
            <p>${escapeHtml(record.legalEntityLabel || "Юридична назва не вказана")}</p>
            <p>Код / ІПН: ${escapeHtml("Не вказано")}</p>
            <p>Email: ${escapeHtml(record.contactEmail || "Не вказано")}</p>
            <p>Телефон: ${escapeHtml(record.contactPhone || "Не вказано")}</p>
            <p>Підписант: ${escapeHtml(record.signatoryLabel || "Не вказано")}</p>
            <p>Умови оплати: ${escapeHtml(record.paymentRail || "Не вказано")}</p>
            <p class="signature">${escapeHtml(customerSignatoryRole)} ____________________ ${escapeHtml(customerSignatoryName)}</p>
          </div>
        </div>
        </div>
      </body>
    </html>`;
  }

  const extraSection =
    kind === "techCard"
        ? `
          <div class="meta-block">
            <div><b>Статус дизайну:</b> ${escapeHtml(record.designStatuses.join(", ") || "Не вказано")}</div>
            <div><b>Менеджер:</b> ${escapeHtml(record.managerLabel)}</div>
            <div><b>Оплата:</b> ${escapeHtml(record.paymentRail)}</div>
          </div>`
        : `
          <div class="meta-block">
            <div><b>Замовник:</b> ${escapeHtml(record.customerName)}</div>
            <div><b>Email:</b> ${escapeHtml(record.contactEmail || "Не вказано")}</div>
            <div><b>Телефон:</b> ${escapeHtml(record.contactPhone || "Не вказано")}</div>
          </div>`;

  return `<!doctype html>
  <html lang="uk">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)} ${escapeHtml(record.quoteNumber)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111827; margin: 0; background: #f3f4f6; }
        .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 24px; background: rgba(255,255,255,0.96); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(8px); }
        .toolbar-title { font-size: 14px; color: #4b5563; }
        .toolbar-actions { display: flex; gap: 12px; }
        .toolbar-button { border: 1px solid #d1d5db; background: #ffffff; color: #111827; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .toolbar-button.primary { background: #111827; border-color: #111827; color: #ffffff; }
        .page { max-width: 960px; margin: 24px auto; background: #ffffff; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); padding: 32px; }
        h1 { font-size: 28px; margin: 0 0 8px; }
        .sub { color: #6b7280; margin-bottom: 24px; }
        .meta-block { margin: 0 0 20px; display: grid; gap: 6px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 14px; }
        th { background: #f8fafc; text-align: left; }
        .num { text-align: right; white-space: nowrap; }
        .total { margin-top: 16px; display: flex; justify-content: flex-end; font-size: 18px; font-weight: bold; }
        @media print {
          body { background: #ffffff; }
          .toolbar { display: none; }
          .page { max-width: none; margin: 0; box-shadow: none; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <div class="toolbar-title">${escapeHtml(title)} ${escapeHtml(record.quoteNumber)}</div>
        <div class="toolbar-actions">
          <button class="toolbar-button" type="button" onclick="window.close()">Закрити</button>
          <button class="toolbar-button primary" type="button" onclick="window.print()">Зберегти PDF / Друк</button>
        </div>
      </div>
      <div class="page">
      <h1>${escapeHtml(title)}</h1>
      <div class="sub">Замовлення ${escapeHtml(record.quoteNumber)} від ${escapeHtml(formatOrderDate(record.updatedAt))}</div>
      ${extraSection}
      <table>
        <thead>
          <tr>
            <th style="width:50px;">№</th>
            <th>Товар</th>
            <th style="width:70px;">Од.</th>
            <th style="width:120px;">Кількість</th>
            <th style="width:160px;">Ціна</th>
            <th style="width:160px;">Сума</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Всього: ${escapeHtml(formatOrderMoney(record.total, record.currency))}</div>
      </div>
    </body>
  </html>`;
};

export default function OrdersProductionDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { teamId, loading: authLoading, session, userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<DerivedOrderRecord | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    if (!teamId || !id) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const orders = await loadDerivedOrders(teamId, userId);
        if (!active) return;
        const current = orders.find((entry) => entry.id === id) ?? null;
        setRecord(current);
        if (!current) {
          setError("Замовлення не знайдено.");
        }
      } catch (loadError: unknown) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Не вдалося відкрити замовлення.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [id, teamId, userId]);

  const doneSteps = useMemo(
    () => record?.readinessSteps.filter((step) => step.done).length ?? 0,
    [record]
  );
  const primaryStatusOptions = ORDER_STATUS_SECTIONS.find((section) => section.id === "primary")?.items ?? [];
  const paymentStatusOptions = ORDER_STATUS_SECTIONS.find((section) => section.id === "payment")?.items ?? [];
  const deliveryStatusOptions = ORDER_STATUS_SECTIONS.find((section) => section.id === "delivery")?.items ?? [];

  const handleStatusChange = async (field: "orderStatus" | "paymentStatus" | "deliveryStatus", value: string) => {
    if (!record || record.source !== "stored" || !teamId) return;
    const previous = {
      orderStatus: record.orderStatus,
      paymentStatus: record.paymentStatus,
      deliveryStatus: record.deliveryStatus,
    };
    setRecord({
      ...record,
      [field]: value,
    });
    setStatusSaving(true);
    try {
      await updateOrderStatuses({
        teamId,
        orderId: record.id,
        orderStatus: field === "orderStatus" ? value : undefined,
        paymentStatus: field === "paymentStatus" ? value : undefined,
        deliveryStatus: field === "deliveryStatus" ? value : undefined,
      });
    } catch (statusError: unknown) {
      setRecord({
        ...record,
        orderStatus: previous.orderStatus,
        paymentStatus: previous.paymentStatus,
        deliveryStatus: previous.deliveryStatus,
      });
      setError(statusError instanceof Error ? statusError.message : "Не вдалося оновити статуси.");
    } finally {
      setStatusSaving(false);
    }
  };

  const openDocumentPrint = (kind: OrderDocumentKind) => {
    if (!record) return;
    const html = buildOrderDocumentHtml(record, kind);
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Браузер заблокував нове вікно для документа.");
      return;
    }

    try {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      return;
    } catch {
      // Fallback for browsers/extensions that prevent document.write into a popup.
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    popup.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  const openEmailDraft = () => {
    if (!record) return;
    const subject = encodeURIComponent(`Документи по замовленню ${record.quoteNumber}`);
    const body = encodeURIComponent(
      [
        `Вітаю.`,
        ``,
        `Надсилаємо документи по замовленню ${record.quoteNumber}.`,
        `Замовник: ${record.customerName}`,
        `Сума: ${formatOrderMoney(record.total, record.currency)}`,
        ``,
        `Документи можна сформувати зі сторінки замовлення: Договір, Рахунок, СП, Техкарта.`,
      ].join("\n")
    );
    window.location.href = `mailto:${encodeURIComponent(record.contactEmail || "")}?subject=${subject}&body=${body}`;
  };

  const openTelegramDraft = () => {
    if (!record) return;
    const text = encodeURIComponent(
      `Документи по замовленню ${record.quoteNumber}\n${record.customerName}\nСума: ${formatOrderMoney(record.total, record.currency)}`
    );
    window.open(`https://t.me/share/url?url=&text=${text}`, "_blank", "noopener,noreferrer");
  };

  const openViberDraft = () => {
    if (!record) return;
    const text = encodeURIComponent(
      `Документи по замовленню ${record.quoteNumber}. ${record.customerName}. Сума: ${formatOrderMoney(record.total, record.currency)}`
    );
    window.location.href = `viber://forward?text=${text}`;
  };

  if (!id) {
    return <div className="p-6 text-sm text-muted-foreground">Невірний ідентифікатор.</div>;
  }

  if (authLoading || loading) {
    return <AppPageLoader title="Завантаження" subtitle="Відкриваємо деталі замовлення." />;
  }

  if (!session) {
    return <div className="p-6 text-sm text-destructive">User not authenticated</div>;
  }

  if (!teamId) {
    return <div className="p-6 text-sm text-muted-foreground">Немає доступної команди. Перевір членство або інвайт.</div>;
  }

  if (error || !record) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="outline" className="gap-2" onClick={() => navigate("/orders/production")}>
          <ArrowLeft className="h-4 w-4" />
          До списку замовлень
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? "Замовлення не знайдено."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <Button variant="outline" className="gap-2" onClick={() => navigate("/orders/production")}>
            <ArrowLeft className="h-4 w-4" />
            До списку замовлень
          </Button>
          <div className="flex min-w-0 items-start gap-4">
            <EntityAvatar
              src={record.customerLogoUrl}
              name={record.customerName}
              fallback={getInitials(record.customerName)}
              size={52}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-2xl font-semibold text-foreground">{record.quoteNumber}</div>
                <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                  {record.partyType === "customer" ? "Замовник" : "Лід"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px]",
                    record.readinessColumn === "ready"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                      : record.readinessColumn === "design"
                        ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                        : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                  )}
                >
                  {record.readinessColumn === "ready" ? "Готово до замовлення" : "Є блокери"}
                </Badge>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{record.customerName}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Оновлено {formatOrderDate(record.updatedAt)} • сума {formatOrderMoney(record.total, record.currency)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:min-w-[440px]">
          <Card className="border-border/60 p-4">
            <div className="text-xs text-muted-foreground">Статус замовлення</div>
            {record.source === "stored" ? (
              <Select
                value={record.orderStatus}
                onValueChange={(value) => void handleStatusChange("orderStatus", value)}
                disabled={statusSaving}
              >
                <SelectTrigger className="mt-2 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {primaryStatusOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-1 text-sm font-semibold text-foreground">
                {record.readinessColumn === "ready" ? "Нове" : "Підготовка до створення"}
              </div>
            )}
          </Card>
          <Card className="border-border/60 p-4">
            <div className="text-xs text-muted-foreground">Статус оплати</div>
            {record.source === "stored" ? (
              <Select
                value={record.paymentStatus}
                onValueChange={(value) => void handleStatusChange("paymentStatus", value)}
                disabled={statusSaving}
              >
                <SelectTrigger className="mt-2 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentStatusOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-1 text-sm font-semibold text-foreground">Очікує оплату</div>
            )}
          </Card>
          <Card className="border-border/60 p-4">
            <div className="text-xs text-muted-foreground">Статус доставки</div>
            {record.source === "stored" ? (
              <Select
                value={record.deliveryStatus}
                onValueChange={(value) => void handleStatusChange("deliveryStatus", value)}
                disabled={statusSaving}
              >
                <SelectTrigger className="mt-2 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deliveryStatusOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-1 text-sm font-semibold text-foreground">Не відвантажено</div>
            )}
          </Card>
          <Card className="border-border/60 p-4">
            <div className="text-xs text-muted-foreground">Документи</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {renderDocBadge("Договір", record.docs.contract)}
              {renderDocBadge("Рахунок", record.docs.invoice)}
              {renderDocBadge("СП", record.docs.specification)}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            Контрагент
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {record.legalEntityLabel || "Потрібно заповнити реквізити"}
          </div>
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              <span>{record.contactEmail || "Email не заповнений"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              <span>{record.contactPhone || "Телефон не заповнений"}</span>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Оплата
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">{record.paymentRail}</div>
        </Card>

        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />
            Погодження дизайну
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {record.hasApprovedVisualization && record.hasApprovedLayout
              ? "Візуал і макет затверджені"
              : "Потрібна дія по дизайну"}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {record.designStatuses.join(", ") || "Задачі дизайну не знайдені"}
          </div>
        </Card>

        <Card className="border-border/60 p-4">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Менеджер</div>
          <div className="mt-2 text-sm font-semibold text-foreground">{record.managerLabel}</div>
          <div className="mt-2 text-sm text-muted-foreground">{record.signatoryLabel || "Підписанта не вказано"}</div>
        </Card>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="w-14 text-center">№</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead className="w-20 text-center">Од.</TableHead>
              <TableHead className="w-28 text-right">Кількість</TableHead>
              <TableHead className="w-36 text-right">Ціна</TableHead>
              <TableHead className="w-36 pr-6 text-right">Сума</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {record.items.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="text-center font-medium text-muted-foreground">
                  {item.position || index + 1}
                </TableCell>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className="text-center">{item.unit}</TableCell>
                <TableCell className="text-right tabular-nums">{item.qty.toLocaleString("uk-UA")}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOrderMoney(item.unitPrice, record.currency)}</TableCell>
                <TableCell className="pr-6 text-right font-semibold tabular-nums text-foreground">
                  {formatOrderMoney(item.lineTotal, record.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card className="border-border/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Palette className="h-4 w-4 text-muted-foreground" />
          Затверджені матеріали для виробництва
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {renderDesignAssetList("Візуал", record.approvedVisualizationAssets)}
          {renderDesignAssetList("Макет", record.approvedLayoutAssets)}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">Чекліст переходу з прорахунку в замовлення</div>
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
              {doneSteps} / {record.readinessSteps.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {record.readinessSteps.map((step) => (
              <div
                key={step.label}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                  step.done
                    ? "border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                    : "border-amber-300/60 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/10"
                )}
              >
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-200" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-200" />
                )}
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-border/60 p-4">
          <div className="text-sm font-semibold text-foreground">Документи</div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/[0.04] px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Договір
              </div>
              <div className="flex items-center gap-2">
                {record.docs.contract ? (
                  <Button size="sm" variant="outline" onClick={() => openDocumentPrint("contract")}>
                    PDF
                  </Button>
                ) : null}
                {renderDocBadge(record.docs.contract ? "Готовий" : "Немає даних", record.docs.contract)}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/[0.04] px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Рахунок
              </div>
              <div className="flex items-center gap-2">
                {record.docs.invoice ? (
                  <Button size="sm" variant="outline" onClick={() => openDocumentPrint("invoice")}>
                    PDF
                  </Button>
                ) : null}
                {renderDocBadge(record.docs.invoice ? "Готовий" : "Немає позицій", record.docs.invoice)}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/[0.04] px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                СП
              </div>
              <div className="flex items-center gap-2">
                {record.docs.specification ? (
                  <Button size="sm" variant="outline" onClick={() => openDocumentPrint("specification")}>
                    PDF
                  </Button>
                ) : null}
                {renderDocBadge(record.docs.specification ? "Готова" : "Немає позицій", record.docs.specification)}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/[0.04] px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Техкарта
              </div>
              <div className="flex items-center gap-2">
                {record.docs.techCard ? (
                  <Button size="sm" variant="outline" onClick={() => openDocumentPrint("techCard")}>
                    PDF
                  </Button>
                ) : null}
                {renderDocBadge(record.docs.techCard ? "Готова" : "Очікує дизайн", record.docs.techCard)}
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-4">
            <div className="mb-2 text-sm font-semibold text-foreground">Відправити клієнту</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={openEmailDraft} disabled={!record.contactEmail}>
                <Mail className="mr-2 h-4 w-4" />
                Email
              </Button>
              <Button size="sm" variant="outline" onClick={openTelegramDraft}>
                <Send className="mr-2 h-4 w-4" />
                Telegram
              </Button>
              <Button size="sm" variant="outline" onClick={openViberDraft} disabled={!record.contactPhone}>
                <Phone className="mr-2 h-4 w-4" />
                Viber
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
