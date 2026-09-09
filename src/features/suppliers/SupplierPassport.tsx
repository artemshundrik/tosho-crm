import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ROUTES } from "@/layout/routes";
import { formatAgo } from "@/lib/formatAgo";
import { cn } from "@/lib/utils";

import { SupplierMetric } from "./SupplierMetric";

import type { SupplierContractor } from "./queries";
import {
  SUPPLIER_INTAKE_LABEL,
  SUPPLIER_PRICE_BASIS_LABEL,
  type SupplierDefinition,
} from "./suppliersCatalog";
import {
  formatDateShort,
  formatExactDateTime,
  formatInt,
  type SupplierStatus,
} from "./suppliersStatus";

/**
 * Паспорт постачальника — блоки під шапкою сторінки (картка 259).
 * Текст іде з реєстру, числа — зі зведення пулу, контакт — з картки
 * підрядника (правиться там, тут лише читається).
 *
 * ЗГОРНУТИЙ ЗА ЗАМОВЧУВАННЯМ (Артем, 09.09.2026): «кожен раз, коли натискаєш,
 * не треба їх показувати». Сторінку постачальника відкривають, щоб подивитись
 * ТОВАРИ, а платформа, розклад, ціна й особливості — це довідка, яку читають,
 * коли щось зламалось. Розгорнутий паспорт стояв між кліком і тим, заради чого
 * клікали, на цілий екран.
 *
 * Зверху лишається те, що справді читають щоразу — три числа зі зведення пулу.
 * Вони ж підказують, чи варто взагалі розгортати: «оновлено 10 годин тому»
 * відповідає на більшість питань, з якими сюди заходять.
 */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-section border border-border/60 bg-card p-4">
      <h2 className="text-3xs font-semibold uppercase tracking-caps-tight text-muted-foreground">
        {title}
      </h2>
      <div className="mt-2 space-y-1.5 text-sm text-foreground">{children}</div>
    </section>
  );
}

/** Рядок «підпис — значення»; без значення не малюється, щоб не плодити прочерків. */
function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-3">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0">{value}</span>
    </div>
  );
}

const hasContact = (
  contractor: SupplierContractor | null,
): contractor is SupplierContractor =>
  Boolean(
    contractor &&
    (contractor.contact_name ||
      contractor.phones?.length ||
      contractor.emails?.length ||
      contractor.notes),
  );

export function SupplierPassport({
  definition,
  status,
  contractor,
}: {
  definition: SupplierDefinition;
  status: SupplierStatus;
  contractor: SupplierContractor | null;
}) {
  const planned = definition.planned;
  const summary = status.summary;
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-section border border-border/60 bg-card px-4 py-3">
        <div className="grid flex-1 grid-cols-3 gap-4 sm:max-w-md">
          {status.metrics.map((metric) => (
            <SupplierMetric key={metric.label} metric={metric} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Паспорт кабінету
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      {open ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Block
            title={
              planned ? "Як плануємо забирати товари" : "Як забираємо товари"
            }
          >
            <Row label="Платформа" value={definition.platform} />
            <Row
              label="Спосіб"
              value={`${SUPPLIER_INTAKE_LABEL[definition.intake.kind]}: ${definition.intake.summary}`}
            />
            <Row label="Розклад" value={definition.intake.scheduleNote} />
            {definition.cabinetUrl ? (
              <Row
                label="Кабінет"
                value={
                  <a
                    href={definition.cabinetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {definition.cabinetUrl.replace(/^https?:\/\//, "")}
                  </a>
                }
              />
            ) : null}
            {/* Пароля тут немає й не буде: сторінка називає лише МІСЦЕ, де він
            лежить. Секрет, показаний у CRM, далі живе в бекапах бази, у кеші
            браузера й у стенограмах — і жодне з цих місць ми не контролюємо. */}
            {definition.access ? (
              <Row
                label="Доступ"
                value={`Заходимо під нашим акаунтом. Пошта й пароль — у .env.backup поруч із BACKUP_DB_URL: ${definition.access.emailEnv} і ${definition.access.passwordEnv}. У CRM зберігаємо лише імена змінних.`}
              />
            ) : null}
            {summary ? (
              <>
                <Row
                  label="Останнє оновлення"
                  value={
                    summary.last_observed
                      ? `${formatAgo(summary.last_observed)} (${formatExactDateTime(summary.last_observed)})`
                      : "ще не було"
                  }
                />
                <Row
                  label="У пулі"
                  value={`${formatInt(summary.rows_active)} рядків, ${formatInt(summary.products)} товарів, фото у ${formatInt(summary.with_photo)}`}
                />
                <Row
                  label="Перший залив"
                  value={
                    summary.first_loaded
                      ? formatDateShort(summary.first_loaded)
                      : null
                  }
                />
              </>
            ) : null}
          </Block>

          {planned ? (
            <Block title="Що заважає">
              <p>{planned.blocker}</p>
              <p className="text-muted-foreground">
                У черзі з {formatDateShort(planned.since)}.
              </p>
            </Block>
          ) : (
            <Block title="Ціна">
              <Row
                label="Основа"
                value={SUPPLIER_PRICE_BASIS_LABEL[definition.price.basis]}
              />
              <p>{definition.price.summary}</p>
              <Row
                label="Домовлено"
                value={
                  definition.price.agreedOn
                    ? formatDateShort(definition.price.agreedOn)
                    : "домовленість не підтверджена"
                }
              />
              {definition.price.vat ? (
                <Row label="ПДВ" value={definition.price.vat} />
              ) : null}
              <p className="text-muted-foreground">
                {definition.price.basis === "reference"
                  ? "На картках ціни немає: купуємо не в себе."
                  : "На картках стоїть ціна, за якою купуємо."}
              </p>
            </Block>
          )}

          {!planned ? (
            <Block title="Що дає фід">
              <div className="flex flex-wrap gap-1.5">
                {definition.gives.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border/60 px-2.5 py-1 text-2xs"
                  >
                    {item}
                  </span>
                ))}
              </div>
              {definition.lacks.length > 0 ? (
                <>
                  <h3 className="pt-2 text-3xs font-semibold uppercase tracking-caps-tight text-muted-foreground">
                    Чого не дає
                  </h3>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {definition.lacks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Block>
          ) : null}

          {definition.quirks.length > 0 ? (
            <Block title="Особливості">
              <ul className="list-disc space-y-1 pl-4">
                {definition.quirks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Block>
          ) : null}

          <Block title="Контакт">
            {hasContact(contractor) ? (
              <>
                <Row label="Особа" value={contractor.contact_name} />
                <Row
                  label="Телефони"
                  value={
                    contractor.phones?.length
                      ? contractor.phones.join(", ")
                      : null
                  }
                />
                <Row
                  label="Пошта"
                  value={
                    contractor.emails?.length
                      ? contractor.emails.join(", ")
                      : null
                  }
                />
                <Row label="Нотатки" value={contractor.notes} />
              </>
            ) : (
              <p className="text-muted-foreground">
                У картці підрядника контактів ще немає.
              </p>
            )}
            <p className="pt-1 text-2xs text-muted-foreground">
              Правиться у{" "}
              <Link
                to={ROUTES.contractors}
                className="underline underline-offset-2"
              >
                Підрядниках
              </Link>
              {contractor ? ` — картка «${contractor.name}»` : ""}.
            </p>
          </Block>
        </div>
      ) : null}
    </div>
  );
}
