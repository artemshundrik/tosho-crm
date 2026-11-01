import { useCallback, useEffect, useRef, useState } from "react";

import { removeManagedCustomerLogoByUrl } from "@/lib/customerLogo";
import type { CustomerFormState } from "../CustomerDialog";
import { ingestLogo, notifyCustomerManagerChange } from "../partyCardSave";
import { writeCustomerFields, type CustomerFieldPatch } from "../partyFieldWrite";
import { usePartyFieldSave } from "../usePartyFieldSave";
import type { useCustomerCard } from "../useCustomerCard";
import type { TeamMemberOption } from "./useTeamMembers";

/**
 * Дрібне в картці замовника, що пишеться одразу й по одному полю: назва,
 * менеджер, джерело й хто порекомендував, сайт, лого, оплата, бухгалтер,
 * нотатки, нагадування. Один хук на сторінку й бічну панель — щоб вони не
 * розійшлись у тому, що й куди пишуть.
 *
 * Менеджер і лого мають наслідки поза полем — так само, як у повній формі
 * (`saveCustomerCard`): новому менеджерові йде сповіщення, а старе лого з
 * нашого сховища прибирається після того, як нове записалось.
 */

type Card = ReturnType<typeof useCustomerCard>;

export function useCustomerQuickSave(params: {
  customerId: string;
  teamId: string | null;
  userId: string | null;
  card: Card;
  members: TeamMemberOption[];
  onSaved?: (form: CustomerFormState | null) => void;
}) {
  const { customerId, teamId, userId, card, members } = params;
  const { row, update } = card;
  const formRef = useRef(card.form);
  formRef.current = card.form;
  const onSavedRef = useRef(params.onSaved);
  onSavedRef.current = params.onSaved;

  // Що було в базі до правки: від цього залежить сповіщення й прибирання лого.
  const savedRef = useRef({ managerUserId: null as string | null, managerLabel: "", logoUrl: null as string | null });
  useEffect(() => {
    savedRef.current = {
      managerUserId: row?.manager_user_id?.trim() || null,
      managerLabel: row?.manager ?? "",
      logoUrl: row?.logo_url ?? null,
    };
  }, [row]);
  const membersRef = useRef(members);
  membersRef.current = members;

  const write = useCallback(
    async (patch: CustomerFieldPatch) => {
      const result = await writeCustomerFields(customerId, patch);
      if (!result.ok) return result;
      window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      onSavedRef.current?.(formRef.current);
      if ("manager_user_id" in patch) {
        const previous = { ...savedRef.current, logoUrl: null };
        const manager = { label: patch.manager ?? "", userId: patch.manager_user_id ?? null };
        savedRef.current = { ...savedRef.current, managerUserId: manager.userId, managerLabel: manager.label };
        void notifyCustomerManagerChange({
          customerId,
          name: formRef.current?.name.trim() ?? "",
          previous,
          manager,
          actor: { userId, name: membersRef.current.find((item) => item.id === userId)?.label ?? "" },
        });
      }
      return result;
    },
    [customerId, teamId, userId],
  );
  const quick = usePartyFieldSave(write);
  const { save } = quick;

  const [paymentSet, setPaymentSet] = useState(true);
  useEffect(() => setPaymentSet(Boolean(row?.payment_type)), [row]);
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  useEffect(() => setReminderAt(row?.reminder_at ?? null), [row]);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const saveName = (name: string) => {
    const next = name.trim();
    if (!next || next === (formRef.current?.name ?? "").trim()) return;
    update({ name: next });
    save("name", { name: next });
  };

  const saveManager = (memberId: string) => {
    const member = members.find((item) => item.id === memberId) ?? null;
    update({ manager: member?.label ?? "", managerId: member?.id ?? "" });
    save("manager", { manager: member?.label || null, manager_user_id: member?.id ?? null });
  };

  const saveSource = (source: string) => {
    update({ source });
    save("source", { source: source.trim() || null });
  };
  const saveReferredBy = (referredBy: string) => {
    if (referredBy.trim() === (formRef.current?.referredBy ?? "").trim()) return;
    update({ referredBy });
    save("referred_by", { referred_by: referredBy.trim() || null });
  };
  const saveWebsite = (website: string) => {
    if (website.trim() === (formRef.current?.website ?? "").trim()) return;
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
        entityType: "customer",
        entityId: customerId,
        preferredName: formRef.current?.name.trim() ?? "",
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
      update({ logoUrl: logoUrl ?? "" });
    } catch (error: unknown) {
      setLogoError(error instanceof Error ? error.message : "Лого не завантажилось.");
    } finally {
      setLogoBusy(false);
    }
  };

  const setPayment = (value: "cash" | "invoice") => {
    setPaymentSet(true);
    update({ paymentType: value });
    save("payment_type", { payment_type: value });
  };

  const saveAccountant = (value: { name: string; email: string; edrpou: string }) => {
    update({ accountantName: value.name, accountantEmail: value.email, accountantEdrpou: value.edrpou });
    save("accountant", {
      accountant_name: value.name.trim() || null,
      accountant_email: value.email.trim() || null,
      accountant_edrpou: value.edrpou.trim() || null,
    });
  };

  const saveNotes = (value: string) => {
    update({ notes: value });
    save("notes", { notes: value.trim() || null });
  };

  const setReminder = (at: string | null, comment?: string) => {
    setReminderAt(at);
    const patch: CustomerFieldPatch = { reminder_at: at };
    if (comment !== undefined || at === null) patch.reminder_comment = at === null ? null : comment ?? null;
    if (comment !== undefined) update({ reminderComment: comment });
    save("reminder", patch);
  };

  return {
    ...quick,
    paymentSet,
    reminderAt,
    logoBusy,
    logoError,
    saveName,
    saveManager,
    saveSource,
    saveReferredBy,
    saveWebsite,
    saveLogoFile,
    setPayment,
    saveAccountant,
    saveNotes,
    setReminder,
  };
}
