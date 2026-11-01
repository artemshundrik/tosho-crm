import * as React from "react";
import { listLeadsBySearch } from "@/lib/toshoApi";
import { findParty } from "@/lib/partyNameMatch";
import type { PartyHoverTarget } from "@/components/app/PartyHoverCard";
import { useOpenPartyCard } from "./partyCardContext";

/**
 * Id ліда для справи, що тримає замовника лише назвою (REQ-193): прорахунок
 * ліда не має посилання на нього. Потрібен, щоб картка під курсором і клік
 * показували ліда так само, як замовника (REQ-348).
 *
 * Один пошук на відкриття сторінки; з `customerId` не шукає взагалі.
 * Правило збігу — спільне `findParty`: краще не знайти, ніж показати чужого.
 */
export function usePartyLeadId(
  teamId: string | null | undefined,
  customerId: string | null | undefined,
  name: string | null | undefined
): string | null {
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const trimmedName = (name ?? "").trim();

  React.useEffect(() => {
    setLeadId(null);
    if (!teamId || customerId || !trimmedName) return;
    let cancelled = false;
    void listLeadsBySearch(teamId, trimmedName)
      .then((rows) => {
        if (cancelled) return;
        const match = findParty(
          rows.map((row) => ({ row, name: row.company_name ?? "", legalName: row.legal_name ?? null })),
          trimmedName
        )?.row;
        setLeadId(match?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setLeadId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, teamId, trimmedName]);

  return leadId;
}

/**
 * Картка для справи, де замовник — id або лише назва (прорахунок): ціль для
 * спливної довідки й клік, що відкриває повну картку на місці (REQ-348).
 */
export function usePartyCardForName(params: {
  teamId: string | null | undefined;
  customerId: string | null | undefined;
  name: string | null | undefined;
  logoUrl?: string | null;
  onSaved?: () => void;
}): { hoverTarget: PartyHoverTarget | null; openCard: () => void } {
  const { teamId, customerId, name, logoUrl, onSaved } = params;
  const openPartyCard = useOpenPartyCard();
  const leadId = usePartyLeadId(teamId, customerId, name);
  const hoverTarget = React.useMemo<PartyHoverTarget | null>(() => {
    const id = customerId ?? leadId;
    if (!id) return null;
    return { kind: customerId ? "customer" : "lead", id, name: name ?? "", logoUrl: logoUrl ?? null };
  }, [customerId, leadId, logoUrl, name]);
  const openCard = React.useCallback(() => {
    openPartyCard?.({ customerId, leadId, name }, { onSaved: onSaved ? () => onSaved() : undefined });
  }, [customerId, leadId, name, onSaved, openPartyCard]);
  return { hoverTarget, openCard };
}
