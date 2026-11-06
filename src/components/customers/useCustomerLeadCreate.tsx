import * as React from "react";

import { PartyCreateDialog } from "./PartyCreateDialog";
import type { CreatedCustomerLead, PartyKind } from "./partyCreate";

export type { CreatedCustomerLead } from "./partyCreate";

type UseCustomerLeadCreateOptions = {
  teamId?: string | null;
  /** Менеджер нової сторони, поки довідник команди не довантажився: поточний користувач. */
  defaultManagerLabel?: string;
  onCreated: (entity: CreatedCustomerLead) => void;
  resolveErrorMessage?: (error: unknown, fallback: string) => string;
};

const defaultResolveErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

/**
 * Створення сторони посеред іншої роботи: `open*` відкриває вікно, `dialogs`
 * кладеться в розмітку, а створену сторону віддає `onCreated`.
 */
export const useCustomerLeadCreate = ({
  teamId,
  defaultManagerLabel = "",
  onCreated,
  resolveErrorMessage = defaultResolveErrorMessage,
}: UseCustomerLeadCreateOptions) => {
  // `nonce` — ключ вікна: кожне відкриття починається з порожньої форми.
  const [request, setRequest] = React.useState<{ kind: PartyKind; name: string; nonce: number }>({ kind: "customer", name: "", nonce: 0 });
  const [open, setOpen] = React.useState(false);

  const openCreate = React.useCallback((kind: PartyKind, name: string) => {
    setRequest((current) => ({ kind, name, nonce: current.nonce + 1 }));
    setOpen(true);
  }, []);
  const openCustomerCreate = React.useCallback((name = "") => openCreate("customer", name), [openCreate]);
  const openLeadCreate = React.useCallback((name = "") => openCreate("lead", name), [openCreate]);

  const dialogs = (
    <PartyCreateDialog
      key={request.nonce}
      kind={request.kind}
      open={open}
      onOpenChange={setOpen}
      teamId={teamId}
      prefillName={request.name}
      defaultManagerLabel={defaultManagerLabel}
      onCreated={onCreated}
      resolveErrorMessage={resolveErrorMessage}
    />
  );

  return { openCustomerCreate, openLeadCreate, dialogs };
};
