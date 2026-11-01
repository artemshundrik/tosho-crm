import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";
import { findParty } from "@/lib/partyNameMatch";
import { LeadDialog } from "./LeadDialog";
import { useLeadEditor } from "./useLeadEditor";
import { CustomerPanel } from "./panel/CustomerPanel";
import type { PartyCardRequest } from "./PartyCardProvider";
import type { PartyCardSavedResult } from "./partyCardContext";

/**
 * Замовник лише назвою (прорахунок ліда, стара задача): шукаємо серед лідів,
 * потім серед замовників. Правило збігу спільне (`findParty`) і не вгадує —
 * показати чужу компанію гірше, ніж сказати «не знайшли».
 */
async function resolvePartyByName(
  teamId: string,
  name: string
): Promise<{ kind: "customer" | "lead"; id: string } | null> {
  const [leads, customers] = await Promise.all([
    listLeadsBySearch(teamId, name),
    listCustomersBySearch(teamId, name),
  ]);
  const lead = findParty(
    leads.map((row) => ({ row, name: row.company_name ?? "", legalName: row.legal_name ?? null })),
    name
  )?.row;
  if (lead?.id) return { kind: "lead", id: lead.id };
  const customer = findParty(
    customers.map((row) => ({ row, name: row.name ?? "", legalName: row.legal_name ?? null })),
    name
  )?.row;
  if (customer?.id) return { kind: "customer", id: customer.id };
  return null;
}

export default function PartyCardHost({ request }: { request: PartyCardRequest }) {
  const { teamId } = useAuth();
  const onSavedRef = React.useRef(request.onSaved);
  React.useEffect(() => {
    onSavedRef.current = request.onSaved;
  }, [request.onSaved]);

  const notifySaved = React.useCallback((result: PartyCardSavedResult) => {
    onSavedRef.current?.(result);
  }, []);

  // Замовник відкривається бічною панеллю (REQ-349); лід поки що — вікном.
  const [customerPanel, setCustomerPanel] = React.useState<{ id: string; fallbackName: string | null } | null>(null);
  const openForCustomer = React.useCallback(
    (id: string, fallbackName: string | null) => setCustomerPanel({ id, fallbackName }),
    []
  );
  const leadEditor = useLeadEditor({
    onSaved: React.useCallback(
      (saved: { id: string; name: string; logoUrl: string | null; convertedCustomerId: string | null }) =>
        notifySaved({ kind: "lead", ...saved }),
      [notifySaved]
    ),
  });

  const { openForLead, closeEditor: closeLeadEditor } = leadEditor;
  const handledNonceRef = React.useRef(0);

  React.useEffect(() => {
    if (handledNonceRef.current === request.nonce) return;
    handledNonceRef.current = request.nonce;
    setCustomerPanel(null);
    const { customerId, leadId, name } = request.target;
    const trimmedName = name?.trim() ?? "";
    const openByName = () => {
      if (!trimmedName || !teamId) {
        toast.error("Замовника не вказано.");
        return;
      }
      void resolvePartyByName(teamId, trimmedName)
        .then((party) => {
          if (handledNonceRef.current !== request.nonce) return;
          if (!party) {
            toast.error(`Не знайшли «${trimmedName}» серед замовників і лідів.`);
            return;
          }
          if (party.kind === "customer") openForCustomer(party.id, trimmedName);
          else void openForLead(party.id);
        })
        .catch(() => toast.error("Не вдалося знайти картку замовника."));
    };
    if (customerId) {
      openForCustomer(customerId, trimmedName || null);
      return;
    }
    if (leadId) {
      // Лід міг стати замовником: старий id уже нікуди не веде, а назва — так.
      void openForLead(leadId).then((found) => {
        if (found || !trimmedName || handledNonceRef.current !== request.nonce) return;
        closeLeadEditor();
        openByName();
      });
      return;
    }
    openByName();
  }, [closeLeadEditor, openForCustomer, openForLead, request, teamId]);

  return (
    <>
      {customerPanel ? (
        <CustomerPanel
          key={customerPanel.id}
          customerId={customerPanel.id}
          fallbackName={customerPanel.fallbackName}
          onClose={() => setCustomerPanel(null)}
          onSaved={notifySaved}
        />
      ) : null}
      <LeadDialog {...leadEditor.editorProps} />
    </>
  );
}
