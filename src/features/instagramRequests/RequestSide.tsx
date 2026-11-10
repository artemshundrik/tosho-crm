import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useOpenPartyCard } from "@/components/customers/partyCardContext";
import { CustomerLeadPicker, type CustomerLeadOption } from "@/components/customers/CustomerLeadPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";
import { cn } from "@/lib/utils";

import { createLeadFromDraft, findExistingParty, validateLeadDraft, type ExistingParty, type LeadDraft } from "./createLead";
import { eventText, hasContact, messageTime, requestStatus } from "./presentation";
import { useRequestAction, type EventRow, type RequestRow } from "./queries";
import { canClose, canManage, canReopen, type RequestActor, type WorkHours } from "./rules";
import { SectionLabel, ToneTag } from "./ui";

type Props = {
  request: RequestRow;
  events: EventRow[];
  actor: RequestActor & { isOwner: boolean };
  teamId: string;
  nameOf: (userId: string | null) => string | null;
  now: Date;
  hours: WorkHours;
  onCloseRequest: () => void;
  className?: string;
};

export function RequestSide({ request, events, actor, teamId, nameOf, now, hours, onCloseRequest, className }: Props) {
  const navigate = useNavigate();
  const action = useRequestAction();
  const status = requestStatus(request, now, hours);
  const manage = canManage(actor, request);
  const showForm = manage && (request.status === "new" || request.status === "in_progress");

  const [company, setCompany] = React.useState(request.company_name ?? "");
  const [contact, setContact] = React.useState(request.contact ?? "");
  const [firstName, setFirstName] = React.useState((request.display_name ?? "").trim().split(/\s+/)[0] ?? "");
  const [leadError, setLeadError] = React.useState<string | null>(null);
  const [duplicate, setDuplicate] = React.useState<ExistingParty | null>(null);
  const [creatingLead, setCreatingLead] = React.useState(false);
  const openParty = useOpenPartyCard();
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  // Поки людина друкує, живе оновлення не має перетирати її текст.
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    if (focusedRef.current) return;
    setCompany(request.company_name ?? "");
    setContact(request.contact ?? "");
  }, [request.id, request.company_name, request.contact]);

  const saveContact = () => {
    focusedRef.current = false;
    if (company.trim() === (request.company_name ?? "") && contact.trim() === (request.contact ?? "")) return;
    action.mutate({ action: "set_contact", requestId: request.id, companyName: company.trim(), contact: contact.trim() });
  };

  const linkAndOpen = (partyKind: "lead" | "customer", partyId: string, name: string) =>
    action.mutate(
      { action: "link_party", requestId: request.id, partyKind, partyId },
      { onSuccess: () => openCard(partyKind === "lead" ? { leadId: partyId, name } : { customerId: partyId, name }) }
    );

  // Лід могли перевести в замовника: прив'язка до заявки має піти за ним.
  const openCard = (target: { leadId?: string; customerId?: string; name?: string }) =>
    openParty?.(target, {
      onSaved: (saved) => {
        if (saved.convertedCustomerId) action.mutate({ action: "link_party", requestId: request.id, partyKind: "customer", partyId: saved.convertedCustomerId });
      },
    });

  const createLead = async (force: boolean) => {
    const person = request.assigned_user_id ?? actor.userId;
    const manager = { userId: person, name: nameOf(person) ?? "" };
    const draft: LeadDraft = { company: company.trim(), firstName: firstName.trim(), contact: contact.trim(), handle: request.handle ?? "" };
    const invalid = validateLeadDraft(draft, manager);
    setLeadError(invalid);
    setDuplicate(null);
    if (invalid) return;
    setCreatingLead(true);
    try {
      const existing = force ? null : await findExistingParty(teamId, draft.company);
      if (existing) {
        setDuplicate(existing);
        return;
      }
      const leadId = await createLeadFromDraft({ teamId, draft, manager, actor: { userId: actor.userId, name: nameOf(actor.userId) ?? "" } });
      linkAndOpen("lead", leadId, draft.company);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося створити ліда");
    } finally {
      setCreatingLead(false);
    }
  };

  const canDelete = actor.isOwner || (request.is_test && actor.isOwnerOrCeo);
  const leadReady = hasContact({ company_name: company, contact });

  return (
    <aside aria-label="Дані заявки" className={cn("flex min-h-0 flex-col gap-3.5 overflow-y-auto bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Статус</SectionLabel>
        <ToneTag {...status} className="rounded-md px-2 py-0.5 text-xs" />
      </div>

      {showForm ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <label htmlFor="req-company" className="text-xs text-muted-foreground">
              Назва компанії
            </label>
            <Input
              id="req-company"
              value={company}
              maxLength={200}
              placeholder="Ще не знаємо"
              onFocus={() => (focusedRef.current = true)}
              onChange={(event) => setCompany(event.target.value)}
              onBlur={saveContact}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="req-name" className="text-xs text-muted-foreground">
              Ім'я
            </label>
            <Input id="req-name" value={firstName} maxLength={100} placeholder="Ще не знаємо" onChange={(event) => setFirstName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="req-contact" className="text-xs text-muted-foreground">
              Телефон або Telegram
            </label>
            <Input
              id="req-contact"
              value={contact}
              maxLength={200}
              placeholder="Ще не знаємо"
              onFocus={() => (focusedRef.current = true)}
              onChange={(event) => setContact(event.target.value)}
              onBlur={saveContact}
            />
          </div>
          <Button size="lg" variant={leadReady ? "primary" : "secondary"} loading={creatingLead} onClick={() => void createLead(false)}>
            Створити ліда
          </Button>
          {leadError ? <p className="text-xs text-danger-foreground">{leadError}</p> : null}
          {duplicate ? (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
              <p className="text-xs">
                «{duplicate.name}» уже є в базі як {duplicate.kind === "lead" ? "лід" : "замовник"}.
              </p>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => linkAndOpen(duplicate.kind, duplicate.id, duplicate.name)}>
                  Прив'язати
                </Button>
                <Button size="sm" variant="outline" loading={creatingLead} onClick={() => void createLead(true)}>
                  Створити все одно
                </Button>
              </div>
            </div>
          ) : null}
          <PartyLink request={request} teamId={teamId} />
          {canClose(actor, request) ? (
            <Button variant="outline" size="md" onClick={onCloseRequest}>
              Закрити без ліда
            </Button>
          ) : null}
        </div>
      ) : null}

      {request.kind === "ad" && request.status === "lead" ? (
        <>
          <p className="text-md text-muted-foreground">
            {request.party_name ? `Картка «${request.party_name}». ` : ""}Далі прорахунок і замовлення йдуть звичайним шляхом.
          </p>
          {request.lead_id || request.customer_id || request.party_name ? (
            <Button
              size="lg"
              onClick={() =>
                openCard({ leadId: request.lead_id ?? undefined, customerId: request.customer_id ?? undefined, name: request.party_name ?? undefined })
              }
            >
              Відкрити картку
            </Button>
          ) : null}
        </>
      ) : null}

      {canReopen(actor, request) ? (
        <Button variant="outline" size="md" loading={action.isPending} onClick={() => action.mutate({ action: "reopen", requestId: request.id })}>
          Повернути в роботу
        </Button>
      ) : null}

      {request.kind === "other" && actor.isOwnerOrCeo && request.status !== "closed" ? (
        <>
          <Button size="lg" loading={action.isPending} onClick={() => action.mutate({ action: "convert_other", requestId: request.id })}>
            Це клієнт: передати менеджеру
          </Button>
          <Button variant="outline" size="md" onClick={() => action.mutate({ action: "archive_other", requestId: request.id })}>
            Не клієнт: у архів
          </Button>
        </>
      ) : null}

      {request.is_test && actor.isOwnerOrCeo ? <TestPanel request={request} /> : null}

      <div className="flex flex-col gap-2 border-t border-line-subtle pt-3">
        <SectionLabel>Історія</SectionLabel>
        {events.flatMap((event) => {
          const text = eventText(event, nameOf);
          return text ? [
            <span key={event.id} className="text-xs text-muted-foreground">
              {messageTime(event.created_at, now)} {text}
            </span>,
          ] : [];
        })}
      </div>

      {canDelete ? (
        <Button variant="ghost" size="sm" className="mt-auto self-start text-muted-foreground" onClick={() => setDeleteOpen(true)}>
          Видалити розмову
        </Button>
      ) : null}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Видалити розмову назавжди?</DialogTitle>
            <DialogDescription>Зникнуть заявка, усі повідомлення й історія. Це робимо лише на прохання людини. Повернути не можна.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Скасувати
            </Button>
            <Button
              variant="destructive"
              loading={action.isPending}
              onClick={() => action.mutate({ action: "delete", requestId: request.id }, { onSuccess: () => navigate("/requests") })}
            >
              Видалити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

/** Людина вже є в базі: заявка прив'язується до її картки, а не плодить дубль. */
function PartyLink({ request, teamId }: { request: RequestRow; teamId: string }) {
  const action = useRequestAction();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [options, setOptions] = React.useState<CustomerLeadOption[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void Promise.all([listCustomersBySearch(teamId, search), listLeadsBySearch(teamId, search)])
        .then(([customers, leads]) => {
          if (cancelled) return;
          type Party = { id: string; name?: string | null; company_name?: string | null; legal_name?: string | null; logo_url?: string | null };
          const toOption = (row: Party, entityType: "customer" | "lead"): CustomerLeadOption => ({
            id: row.id,
            label: row.company_name || row.name || row.legal_name || "Без назви",
            entityType,
            logoUrl: row.logo_url ?? null,
            legalName: row.legal_name ?? null,
          });
          setOptions([...(customers as unknown as Party[]).map((row) => toOption(row, "customer")), ...(leads as unknown as Party[]).map((row) => toOption(row, "lead"))]);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, teamId]);

  return (
    <CustomerLeadPicker
      open={open}
      onOpenChange={setOpen}
      selectedLabel=""
      searchValue={search}
      onSearchChange={setSearch}
      options={options}
      loading={loading}
      chipLabel="Уже є в базі"
      onSelect={(option) => {
        setOpen(false);
        action.mutate({ action: "link_party", requestId: request.id, partyKind: option.entityType, partyId: option.id });
      }}
    />
  );
}

/** Лише на тестових заявках: прокрутити стани, не чекаючи реального клієнта й 30 хвилин. */
function TestPanel({ request }: { request: RequestRow }) {
  const action = useRequestAction();
  const [text, setText] = React.useState("Це повідомлення від клієнта");
  const run = (payload: Record<string, unknown> & { action: string }) => action.mutate({ requestId: request.id, ...payload });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-2.5">
      <SectionLabel>Перевірка</SectionLabel>
      <Input aria-label="Текст тестового повідомлення" value={text} maxLength={1000} onChange={(event) => setText(event.target.value)} />
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run({ action: "test_client_message", text })}>
          Написав клієнт
        </Button>
        <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run({ action: "test_app_reply", text })}>
          Із застосунку
        </Button>
        <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run({ action: "test_expire", what: "reminder" })}>
          Час нагадування
        </Button>
        <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run({ action: "test_expire", what: "handover" })}>
          Час передачі
        </Button>
        <Button variant="outline" size="sm" className="col-span-2" disabled={action.isPending} onClick={() => run({ action: "test_expire", what: "window" })}>
          Минуло 7 днів
        </Button>
      </div>
      <p className="text-2xs text-muted-foreground">Щоб побачити «Не надіслано», додайте до відповіді !fail.</p>
    </div>
  );
}
