import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";
import { findParty } from "@/lib/partyNameMatch";
import { LeadDialog } from "./LeadDialog";
import { useLeadEditor } from "./useLeadEditor";
import { CustomerPanel } from "./panel/CustomerPanel";
import { LeadPanel } from "./panel/LeadPanel";
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

type PanelTarget = { kind: "customer" | "lead"; id: string; fallbackName: string | null };

export default function PartyCardHost({ request }: { request: PartyCardRequest }) {
  const { teamId } = useAuth();
  const onSavedRef = React.useRef(request.onSaved);
  React.useEffect(() => {
    onSavedRef.current = request.onSaved;
  }, [request.onSaved]);

  const notifySaved = React.useCallback((result: PartyCardSavedResult) => {
    onSavedRef.current?.(result);
  }, []);

  // Замовник і лід відкриваються бічною панеллю (REQ-349). Вікно ліда лишилось
  // повною карткою: назва, джерело, контакт правляться там.
  const [panel, setPanel] = React.useState<PanelTarget | null>(null);
  const openForCustomer = React.useCallback(
    (id: string, fallbackName: string | null) => setPanel({ kind: "customer", id, fallbackName }),
    []
  );
  const openLeadPanel = React.useCallback(
    (id: string, fallbackName: string | null) => setPanel({ kind: "lead", id, fallbackName }),
    []
  );
  const leadEditor = useLeadEditor({
    onSaved: React.useCallback(
      (saved: { id: string; name: string; logoUrl: string | null; convertedCustomerId: string | null }) =>
        notifySaved({ kind: "lead", ...saved }),
      [notifySaved]
    ),
  });

  const { openForLead } = leadEditor;
  const handledNonceRef = React.useRef(0);
  const openByNameRef = React.useRef<() => void>(() => undefined);

  React.useEffect(() => {
    if (handledNonceRef.current === request.nonce) return;
    handledNonceRef.current = request.nonce;
    setPanel(null);
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
          else openLeadPanel(party.id, trimmedName);
        })
        .catch(() => toast.error("Не вдалося знайти картку замовника."));
    };
    if (customerId) {
      openForCustomer(customerId, trimmedName || null);
      return;
    }
    // Лід міг стати замовником: старий id уже нікуди не веде, а назва — так
    // (панель кличе `onMissing`).
    // Один раз: знайдений за назвою лід, якого знов «немає», не крутить по колу.
    openByNameRef.current = () => {
      openByNameRef.current = () => undefined;
      if (!trimmedName || handledNonceRef.current !== request.nonce) return;
      setPanel(null);
      openByName();
    };
    if (leadId) {
      openLeadPanel(leadId, trimmedName || null);
      return;
    }
    openByName();
  }, [openForCustomer, openLeadPanel, request, teamId]);

  return (
    <>
      {panel?.kind === "customer" ? (
        <CustomerPanel
          key={panel.id}
          customerId={panel.id}
          fallbackName={panel.fallbackName}
          onClose={() => setPanel(null)}
          onSaved={notifySaved}
        />
      ) : null}
      {panel?.kind === "lead" ? (
        <LeadPanel
          key={panel.id}
          leadId={panel.id}
          fallbackName={panel.fallbackName}
          onClose={() => setPanel(null)}
          onOpenFull={() => {
            setPanel(null);
            void openForLead(panel.id);
          }}
          onSaved={notifySaved}
          onConverted={(customerId) => openForCustomer(customerId, panel.fallbackName)}
          onMissing={() => openByNameRef.current()}
        />
      ) : null}
      <LeadDialog {...leadEditor.editorProps} />
    </>
  );
}
