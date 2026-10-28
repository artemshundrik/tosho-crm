import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabaseClient";
import { isMissingOrdersColumnMessage, isMissingOrdersRelationMessage } from "./ordersSchemaErrors";
import type { BalanceDaysKind } from "./paymentRules";

/** Умови договору й СП на замовленні: пише лише передані поля. */
export async function updateOrderDocumentSettings(params: {
  teamId: string;
  orderId: string;
  paymentMethodId?: string;
  paymentMethodLabel?: string;
  paymentTerms?: string;
  prepaymentPct?: number | null;
  balancePct?: number | null;
  balanceTiming?: "before_shipment" | "after_shipment" | null;
  balanceDaysAfterShipment?: number | null;
  balanceDaysKind?: BalanceDaysKind | null;
  incotermsCode?: string;
  incotermsPlace?: string | null;
  contractNumber?: string | null;
  contractDate?: string | null;
  contractProductionDays?: number | null;
  contractAutoProlongation?: boolean;
  specIncludeVisualization?: boolean | null;
  specificationNumber?: number | null;
}) {
  const payload: Database["tosho"]["Tables"]["orders"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (params.paymentMethodId !== undefined) payload.payment_method_id = params.paymentMethodId;
  if (params.paymentMethodLabel !== undefined) payload.payment_method_label = params.paymentMethodLabel;
  if (params.paymentTerms !== undefined) payload.payment_terms = params.paymentTerms;
  if (params.prepaymentPct !== undefined) payload.prepayment_pct = params.prepaymentPct;
  if (params.balancePct !== undefined) payload.balance_pct = params.balancePct;
  if (params.balanceTiming !== undefined) payload.balance_timing = params.balanceTiming;
  if (params.balanceDaysAfterShipment !== undefined) payload.balance_days_after_shipment = params.balanceDaysAfterShipment;
  if (params.balanceDaysKind !== undefined) payload.balance_days_kind = params.balanceDaysKind;
  if (params.incotermsCode !== undefined) payload.incoterms_code = params.incotermsCode;
  if (params.incotermsPlace !== undefined) payload.incoterms_place = params.incotermsPlace;
  if (params.contractNumber !== undefined) payload.contract_number = params.contractNumber;
  if (params.contractDate !== undefined) payload.contract_date = params.contractDate;
  if (params.contractProductionDays !== undefined) payload.contract_production_days = params.contractProductionDays;
  if (params.contractAutoProlongation !== undefined) payload.contract_auto_prolongation = params.contractAutoProlongation;
  if (params.specIncludeVisualization !== undefined) payload.spec_include_visualization = params.specIncludeVisualization;
  if (params.specificationNumber !== undefined) payload.specification_number = params.specificationNumber;

  const { error } = await supabase
    .schema("tosho")
    .from("orders")
    .update(payload)
    .eq("team_id", params.teamId)
    .eq("id", params.orderId);

  if (error) {
    if (isMissingOrdersRelationMessage(error.message) || isMissingOrdersColumnMessage(error.message)) {
      throw new Error("Таблиця замовлень не має полів для СП. Запустіть оновлений scripts/orders-schema.sql.");
    }
    throw error;
  }
}
