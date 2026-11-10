import { deflateSync } from "node:zlib";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { APPROVAL_WIDGET_HTML } from "./telegramWidgetTemplates.generated";
import { fitCaption } from "./telegramWidgets";

/**
 * Запит погодити СП чи договір як віджет Telegram (REQ-356#p1).
 *
 * Бухгалтер або СЕО бачить у боті саму суть документа: замовника з лого,
 * суму й розбивку оплати, позиції з характеристиками, строки й стан договору.
 * Під віджетом «✅ Погодити» (рішення прямо з бота, через
 * tosho.bot_decide_order_approval) і «↩️ Повернути», що веде в CRM, бо
 * повернення потребує записки.
 *
 * ДАНІ ЛЕЖАТЬ У HTML (window.DN), а не в chat_data: позиції з
 * характеристиками не влазять у 1024 байти. Лого — CSS-змінна з data URI;
 * не влазить навіть менше — ініціали.
 */

const HTML_LIMIT = 3950;
const LOGO_STEPS = [60, 44, 0];
const LOGO_QUALITY = 55;
const FETCH_TIMEOUT_MS = 4000;

export const ORDER_APPROVAL_CALLBACK_PREFIX = "oap";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** «oap:a:<uuid>» → id запиту погодження. Будь-що інше — null. */
export function parseOrderApprovalCallback(data: string | null | undefined): { approvalId: string } | null {
  const [prefix, verb, id, ...rest] = (data ?? "").split(":");
  if (prefix !== ORDER_APPROVAL_CALLBACK_PREFIX || verb !== "a" || rest.length > 0 || !UUID_RE.test(id ?? "")) return null;
  return { approvalId: id.toLowerCase() };
}

export function orderApprovalCallbackData(approvalId: string): string {
  return `${ORDER_APPROVAL_CALLBACK_PREFIX}:a:${approvalId}`;
}

export type ApprovalKind = "contract" | "specification";

export type OrderApprovalRecord = {
  id: string;
  team_id: string;
  order_id: string;
  kind: string;
  status: string;
  requested_by: string | null;
  requested_at: string | null;
};

type OrderRow = {
  id: string;
  team_id: string;
  quote_number: string | null;
  customer_name: string | null;
  customer_id: string | null;
  customer_logo_url: string | null;
  legal_entity_label: string | null;
  customer_tax_id: string | null;
  total: number | string | null;
  currency: string | null;
  prepayment_pct: number | string | null;
  balance_timing: string | null;
  balance_days_after_shipment: number | null;
  balance_days_kind: string | null;
  contract_production_days: number | null;
  incoterms_code: string | null;
  incoterms_place: string | null;
  delivery_type: string | null;
  payment_method_label: string | null;
  contract_signed_at: string | null;
  contract_signed_via: string | null;
  contract_auto_prolongation: boolean | null;
  customer_signatory_authority: string | null;
  specification_number: number | null;
};

type ItemRow = {
  name: string | null;
  qty: number | string | null;
  unit: string | null;
  line_total: number | string | null;
  spec_text: string | null;
  description: string | null;
};

const ORDER_COLUMNS =
  "id,team_id,quote_number,customer_name,customer_id,customer_logo_url,legal_entity_label,customer_tax_id,total,currency,prepayment_pct,balance_timing,balance_days_after_shipment,balance_days_kind,contract_production_days,incoterms_code,incoterms_place,delivery_type,payment_method_label,contract_signed_at,contract_signed_via,contract_auto_prolongation,customer_signatory_authority,specification_number";

const DELIVERY_LABELS: Record<string, string> = {
  nova_poshta: "Нова пошта",
  pickup: "самовивіз",
  taxi: "таксі",
  cargo: "вантажне",
};

const SIGNED_VIA: Record<string, string> = { paper: "паперово", vchasno: "у Вчасно", medoc: "у Медку" };

const num = (value: number | string | null | undefined) => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

/** «Дар'я Мезенцева» → «Дар'я М.». */
export function shortPersonName(name: string | null | undefined): string {
  const [first, second] = clean(name).split(" ");
  if (!first) return "";
  return second ? `${first} ${second[0]}.` : first;
}

const KYIV = "Europe/Kyiv";

/** «сьогодні, 09:12» / «30 жовтня, 09:30». */
export function formatKyivMoment(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = (d: Date) => d.toLocaleDateString("uk-UA", { timeZone: KYIV, day: "numeric", month: "long" });
  const time = date.toLocaleTimeString("uk-UA", { timeZone: KYIV, hour: "2-digit", minute: "2-digit" });
  return `${day(date) === day(now) ? "сьогодні" : day(date)}, ${time}`;
}

function balanceLabel(order: OrderRow): string {
  if (order.balance_timing === "after_shipment") {
    const days = order.balance_days_after_shipment;
    return days ? `${days} ${order.balance_days_kind === "calendar" ? "к.д." : "р.д."} після відвантаження` : "після відвантаження";
  }
  return "до відвантаження";
}

function deliveryLabel(order: OrderRow): string {
  const type = order.delivery_type ? (DELIVERY_LABELS[order.delivery_type] ?? order.delivery_type) : "";
  const place = clean(order.incoterms_place);
  const label = [clean(order.incoterms_code), place, type].filter(Boolean).join(", ") || "не вказано";
  return label.length > 34 ? `${label.slice(0, 33).trimEnd()}…` : label;
}

export type ApprovalWidgetData = {
  t: string;
  o: string;
  c: string;
  e: string;
  s: number;
  ns?: string;
  pp: number;
  bt: string;
  p: Array<[string, number, string, number, string]>;
  k: Array<[string, string] | [string, string, "w" | "g"]>;
  f: string;
};

export function buildApprovalWidgetData(params: {
  kind: ApprovalKind;
  order: OrderRow;
  items: ItemRow[];
  requesterName: string | null;
  requestedAt: string | null;
  specLimit?: number;
  now?: Date;
}): ApprovalWidgetData {
  const { order, kind } = params;
  const specLimit = params.specLimit ?? 220;
  const facts: ApprovalWidgetData["k"] = [];
  const production = order.contract_production_days;
  facts.push(["Виготовлення", production ? `${production} роб. днів` : "не вказано", ...(production ? [] : ["w" as const])] as ApprovalWidgetData["k"][number]);
  if (kind === "contract") {
    facts.push(["Пролонгація", order.contract_auto_prolongation ? "так" : "ні"]);
    const authority = clean(order.customer_signatory_authority);
    facts.push(authority ? ["Підстава підпису", authority] : ["Підстава підпису", "не вказано", "w"]);
  } else {
    facts.push(["Доставка", deliveryLabel(order)]);
    facts.push(
      order.contract_signed_at
        ? ["Договір", `підписано ${SIGNED_VIA[order.contract_signed_via ?? ""] ?? ""}`.trim(), "g"]
        : ["Договір", "не підписано", "w"]
    );
  }
  facts.push(["Оплата", clean(order.payment_method_label).toLowerCase().replace(/\.$/, "") || "не вказано"]);

  const legal = clean(order.legal_entity_label);
  const tax = clean(order.customer_tax_id);
  const who = shortPersonName(params.requesterName);
  const when = formatKyivMoment(params.requestedAt, params.now);
  return {
    t: kind === "contract" ? "Погодити договір" : `Погодити СП${order.specification_number ? ` №${order.specification_number}` : ""}`,
    o: clean(order.quote_number),
    c: clean(order.customer_name) || legal || "Замовник",
    e: [legal, tax ? `ЄДРПОУ ${tax}` : ""].filter(Boolean).join(" · "),
    s: Math.round(num(order.total) * 100) / 100,
    ...(kind === "contract" ? { ns: "сума цього замовлення" } : {}),
    pp: Math.max(0, Math.min(100, Math.round(num(order.prepayment_pct)))),
    bt: balanceLabel(order),
    p: params.items
      .filter((item) => num(item.qty) > 0)
      .map((item) => {
        const spec = clean(item.spec_text) || clean(item.description);
        return [
          clean(item.name) || "Позиція",
          num(item.qty),
          clean(item.unit) || "шт.",
          Math.round(num(item.line_total) * 100) / 100,
          spec.length > specLimit ? `${spec.slice(0, specLimit - 1).trimEnd()}…` : spec,
        ];
      }),
    k: facts,
    f: [who ? `Просить ${who}` : "", when].filter(Boolean).join(" · "),
  };
}

/** `</script>` у чужому тексті не має закрити наш скрипт. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const compressedSize = (html: string) => deflateSync(Buffer.from(html), { level: 9 }).length;

/**
 * Тягнемо лого лише з публічного сховища НАШОГО Supabase. Адреса лежить у
 * рядку замовлення, який редагують люди; довільний URL перетворив би функцію
 * на проксі в будь-яку мережу (SSRF).
 */
export function isOwnPublicStorageUrl(url: string | null | undefined, supabaseUrl: string | undefined): boolean {
  if (!url || !supabaseUrl) return false;
  try {
    const target = new URL(url);
    const own = new URL(supabaseUrl);
    return target.protocol === "https:" && target.host === own.host && target.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

export async function fetchLogo(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 0 && buffer.length < 5_000_000 ? buffer : null;
  } catch {
    return null;
  }
}

async function logoStyle(logo: Buffer, px: number): Promise<string | null> {
  try {
    const image = await sharp(logo)
      .resize(px, px, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .webp({ quality: LOGO_QUALITY, effort: 6 })
      .toBuffer();
    return `<style>:root{--lg:url(data:image/webp;base64,${image.toString("base64")})}</style>`;
  } catch {
    return null;
  }
}

/** Збирає HTML: лого якомога більше, далі коротші характеристики, далі без лого. */
export async function fitApprovalWidget(
  build: (specLimit: number) => ApprovalWidgetData,
  logo: Buffer | null
): Promise<string | null> {
  for (const specLimit of [220, 120, 0]) {
    const body = `<script>DN=${inlineJson(build(specLimit))}</script>${APPROVAL_WIDGET_HTML}`;
    for (const px of logo ? LOGO_STEPS : [0]) {
      const style = px > 0 && logo ? await logoStyle(logo, px) : "";
      if (style === null) continue;
      const html = `${style}${body}`;
      if (compressedSize(html) <= HTML_LIMIT) return html;
    }
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function approvalCaption(data: ApprovalWidgetData, approvedLine?: string): string {
  const money = `${Math.round(data.s).toLocaleString("uk-UA").replace(/\s/g, " ")} ₴`;
  return fitCaption(
    [
      `<b>${escapeHtml(data.o)}: ${escapeHtml(data.t.replace(/^Погодити /, "погодити "))}</b>\n${escapeHtml(data.c)} · ${money}${data.pp ? ` · передоплата ${data.pp}%` : ""}`,
      approvedLine ? escapeHtml(approvedLine) : escapeHtml(data.f),
    ].filter(Boolean)
  );
}

export type LoadedApproval = {
  approval: OrderApprovalRecord;
  html: string | null;
  caption: string;
  href: string;
};

/**
 * Читає запит, замовлення й позиції й збирає віджет. null — запит не той
 * (не СП/договір, вже вирішений, чужа команда).
 */
export async function loadOrderApprovalWidget(
  admin: SupabaseClient,
  approvalId: string,
  options: { teamIds?: string[]; requestedBy?: string; supabaseUrl?: string } = {}
): Promise<LoadedApproval | null> {
  if (!UUID_RE.test(approvalId)) return null;
  const { data: approvalData } = await admin
    .schema("tosho")
    .from("order_approvals")
    .select("id,team_id,order_id,kind,status,requested_by,requested_at")
    .eq("id", approvalId)
    .maybeSingle();
  const approval = approvalData as OrderApprovalRecord | null;
  if (!approval || approval.status !== "pending") return null;
  if (approval.kind !== "contract" && approval.kind !== "specification") return null;
  if (options.teamIds && !options.teamIds.includes(approval.team_id)) return null;
  if (options.requestedBy && approval.requested_by !== options.requestedBy) return null;

  const [{ data: orderData }, { data: itemsData }, { data: profile }] = await Promise.all([
    admin.schema("tosho").from("orders").select(ORDER_COLUMNS).eq("id", approval.order_id).eq("team_id", approval.team_id).maybeSingle(),
    admin
      .schema("tosho")
      .from("order_items")
      .select("name,qty,unit,line_total,spec_text,description,position")
      .eq("order_id", approval.order_id)
      .eq("team_id", approval.team_id)
      .order("position", { ascending: true }),
    approval.requested_by
      ? admin.schema("tosho").from("team_member_profiles").select("full_name,first_name,last_name").eq("user_id", approval.requested_by).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const order = orderData as OrderRow | null;
  if (!order) return null;

  let logoUrl = clean(order.customer_logo_url);
  if (!logoUrl && order.customer_id) {
    const { data: customer } = await admin
      .schema("tosho")
      .from("customers")
      .select("logo_url")
      .eq("id", order.customer_id)
      .eq("team_id", approval.team_id)
      .maybeSingle();
    logoUrl = clean((customer as { logo_url?: string | null } | null)?.logo_url);
  }
  const supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL;
  const logo = isOwnPublicStorageUrl(logoUrl, supabaseUrl) ? await fetchLogo(logoUrl) : null;

  const person = profile as { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
  const requesterName = clean(person?.full_name) || clean(`${person?.first_name ?? ""} ${person?.last_name ?? ""}`) || null;
  const build = (specLimit: number) =>
    buildApprovalWidgetData({
      kind: approval.kind as ApprovalKind,
      order,
      items: (itemsData ?? []) as ItemRow[],
      requesterName,
      requestedAt: approval.requested_at,
      specLimit,
    });
  const html = await fitApprovalWidget(build, logo);
  return { approval, html, caption: approvalCaption(build(0)), href: `/orders/production/${approval.order_id}` };
}
