import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { removeManagedCustomerLogoByUrl } from "@/lib/customerLogo";
import type { TeamMemberOption } from "../card/useTeamMembers";
import type { PartyCardSavedResult } from "../partyCardContext";
import { ingestLogo, notifyLeadManagerChange } from "../partyCardSave";
import { findDuplicatePartyMessage } from "../partyCreate";
import { writeLeadFields, type LeadFieldPatch } from "../partyFieldWrite";
import type { LeadFormState } from "../partyFormTypes";
import type { LeadRow } from "../leadRecord";
import { usePartyFieldSave } from "../usePartyFieldSave";

/**
 * Запис ліда з бічної панелі — по одному полю. Повної форми в ліда немає, тож
 * наслідки поза полем тримаються тут: новому менеджерові йде сповіщення, а старе
 * лого з нашого сховища прибирається після того, як нове записалось.
 *
 * Обовʼязкове порожнім не пишемо: назва, джерело й імʼя лишаються такими, як були.
 */
export function useLeadQuickSave(params: {
  leadId: string;
  teamId: string | null;
  userId: string | null;
  row: LeadRow | null;
  form: LeadFormState | null;
  update: (patch: Partial<LeadFormState>) => void;
  members: TeamMemberOption[];
  onSaved?: (result: PartyCardSavedResult) => void;
}) {
  const { leadId, teamId, userId, row, form, update, members, onSaved } = params;
  const latest = useRef({ form, members, onSaved });
  useEffect(() => {
    latest.current = { form, members, onSaved };
  });

  // Що в базі до правки. Окремо від `row`: від нього залежать ефекти панелі.
  const savedRef = useRef({ managerUserId: null as string | null, managerLabel: "", logoUrl: null as string | null });
  useEffect(() => {
    savedRef.current = {
      managerUserId: row?.manager_user_id?.trim() || null,
      managerLabel: row?.manager ?? "",
      logoUrl: row?.logo_url ?? null,
    };
  }, [row]);

  const write = useCallback(
    async (patch: LeadFieldPatch) => {
      const result = await writeLeadFields(leadId, patch);
      if (!result.ok) return result;
      const current = latest.current;
      window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      current.onSaved?.({
        kind: "lead",
        id: leadId,
        name: current.form?.companyName ?? "",
        logoUrl: current.form?.logoUrl || null,
        convertedCustomerId: null,
      });
      if ("manager_user_id" in patch) {
        const previous = { ...savedRef.current, logoUrl: null };
        const manager = { label: patch.manager ?? "", userId: patch.manager_user_id ?? null };
        savedRef.current = { ...savedRef.current, managerUserId: manager.userId, managerLabel: manager.label };
        void notifyLeadManagerChange({
          leadId,
          name: current.form?.companyName.trim() ?? "",
          previous,
          manager,
          actor: { userId, name: current.members.find((item) => item.id === userId)?.label ?? "" },
        });
      }
      return result;
    },
    [leadId, teamId, userId],
  );
  const quick = usePartyFieldSave(write);
  const { save } = quick;

  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  // Прорахунки ліда тримаються на тексті назви, і тригер бази переписує їх слідом
  // за нею (quotes-party-name-sync.sql). Назва іншої компанії злила б прорахунки
  // обох назавжди: розділити їх уже нічим. Тому це не підказка, а заборона.
  const nameCheck = useRef(0);
  const saveName = async (name: string) => {
    const next = name.trim();
    const previous = latest.current.form?.companyName ?? "";
    if (!next || next === previous.trim()) return;
    const check = ++nameCheck.current;
    update({ companyName: next });
    const duplicate = teamId ? await findDuplicatePartyMessage(teamId, next, { excludeLeadId: leadId }) : null;
    if (check !== nameCheck.current) return;
    if (duplicate) {
      update({ companyName: previous });
      toast.error(duplicate, { description: "Назву не змінено: прорахунки двох компаній злилися б в одну." });
      return;
    }
    save("name", { company_name: next });
  };

  const saveManager = (memberId: string) => {
    const member = members.find((item) => item.id === memberId) ?? null;
    update({ manager: member?.label ?? "", managerId: member?.id ?? "" });
    save("manager", { manager: member?.label || null, manager_user_id: member?.id ?? null });
  };

  const saveSource = (source: string) => {
    if (!source.trim()) return;
    update({ source });
    save("source", { source: source.trim() });
  };
  const saveReferredBy = (referredBy: string) => {
    if (referredBy.trim() === (latest.current.form?.referredBy ?? "").trim()) return;
    update({ referredBy });
    save("referred_by", { referred_by: referredBy.trim() || null });
  };
  const saveWebsite = (website: string) => {
    if (website.trim() === (latest.current.form?.website ?? "").trim()) return;
    update({ website });
    save("website", { website: website.trim() || null });
  };

  const saveLogoFile = async (file: File) => {
    if (!teamId) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      const logoUrl = await ingestLogo({
        teamId,
        entityType: "lead",
        entityId: leadId,
        preferredName: latest.current.form?.companyName.trim() ?? "",
        logoUrl: "",
        logoFile: file,
        logoUploadMode: "file",
      });
      const result = await write({ logo_url: logoUrl });
      if (!result.ok) {
        setLogoError(result.message);
        return;
      }
      const previous = savedRef.current.logoUrl;
      if (previous && previous !== logoUrl) void removeManagedCustomerLogoByUrl(previous);
      savedRef.current = { ...savedRef.current, logoUrl };
      update({ logoUrl: logoUrl ?? "", logoFile: null, logoUploadMode: "url" });
    } catch (error: unknown) {
      setLogoError(error instanceof Error ? error.message : "Лого не завантажилось.");
    } finally {
      setLogoBusy(false);
    }
  };

  return { ...quick, logoBusy, logoError, saveName, saveManager, saveSource, saveReferredBy, saveWebsite, saveLogoFile };
}
