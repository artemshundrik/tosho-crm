import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { Maximize2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { customerPagePath } from "@/layout/routes";
import { ContactsSection, DealsSection, WorkSums } from "../panel/PanelSections";
import { ReadinessBlock } from "../panel/ReadinessBlock";
import { customerReadinessInput, getPartyReadiness } from "../partyReadiness";
import { useCustomerCard } from "../useCustomerCard";

/**
 * Коротка картка замовника при наведенні на рядок списку (варіант А,
 * REQ-349#p13): готовність, основний контакт і два останні рядки роботи.
 *
 * 2 с — щоб картка не вискакувала, коли просто ведеш мишею по таблиці.
 * Дані — той самий `useCustomerCard`, що в шторці й на сторінці, і
 * вантажиться лише коли картка відкрилась.
 */

const OPEN_DELAY_MS = 2000;
const CLOSE_DELAY_MS = 200;

export function CustomerHoverCard(props: {
  teamId: string | null;
  userId: string | null;
  customerId: string;
  onOpenPanel: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const schedule = (next: boolean, delay: number) => {
    clear();
    timer.current = setTimeout(() => setOpen(next), delay);
  };
  const stay = () => clear();
  const leave = () => (open ? schedule(false, CLOSE_DELAY_MS) : clear());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className="inline-flex min-w-0" onMouseEnter={() => (open ? stay() : schedule(true, OPEN_DELAY_MS))} onMouseLeave={leave}>
          {props.children}
        </span>
      </PopoverAnchor>
      {open ? (
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[360px] p-0"
          onMouseEnter={stay}
          onMouseLeave={leave}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onClick={(event) => event.stopPropagation()}
        >
          <HoverBody
            {...props}
            onOpenPanel={() => {
              setOpen(false);
              props.onOpenPanel();
            }}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

function HoverBody(props: { teamId: string | null; userId: string | null; customerId: string; onOpenPanel: () => void }) {
  const navigate = useNavigate();
  const card = useCustomerCard({ teamId: props.teamId, userId: props.userId, customerId: props.customerId });
  const { form, row, records, recordsLoading } = card;
  const readiness = useMemo(() => (form ? getPartyReadiness(customerReadinessInput(form)) : null), [form]);
  const openPage = () => navigate(customerPagePath(props.customerId));
  const name = form?.name || row?.name || "Замовник";

  return (
    <div data-testid="customer-hover" className="flex max-h-[min(70vh,560px)] flex-col">
      <header className="flex items-center gap-2.5 border-b border-line-subtle px-5 py-3">
        <EntityAvatar src={form?.logoUrl || null} name={name} size={32} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{name}</span>
          {form?.manager ? <span className="truncate text-xs text-muted-foreground">{form.manager}</span> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="iconXs"
          aria-label="Розгорнути на всю сторінку"
          title="Розгорнути на всю сторінку"
          onClick={openPage}
        >
          <Maximize2 className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {card.state === "loading" ? (
          <div aria-busy className="space-y-3 px-5 py-4">
            <div className="h-14 animate-pulse rounded-lg bg-muted" />
            <div className="h-10 animate-pulse rounded-lg bg-muted opacity-70" />
          </div>
        ) : null}
        {card.state === "error" || card.state === "gone" ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            {card.state === "gone" ? "Замовника не знайшли." : "Картку не завантажили."}
          </p>
        ) : null}
        {card.state === "ready" && form && readiness ? (
          <>
            <ReadinessBlock readiness={readiness} cash={form.paymentType === "cash"} paymentUnknown={!row?.payment_type} />
            <ContactsSection contacts={form.contacts} />
            <DealsSection
              records={records}
              loading={recordsLoading}
              limit={2}
              before={<WorkSums records={records} />}
              onOpenQuote={(id) => navigate(`/orders/estimates/${id}`)}
              onOpenOrder={(id) => navigate(`/orders/production/${id}`)}
              onShowAll={openPage}
            />
          </>
        ) : null}
      </div>
      <footer className="flex shrink-0 gap-2 border-t border-line-subtle px-5 py-3">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={props.onOpenPanel}>
          Відкрити панель
        </Button>
        <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={openPage}>
          Повна картка
        </Button>
      </footer>
    </div>
  );
}
