import { formatCustomerLegalEntityTitle, pickOrderLegalEntity, type CustomerLegalEntity } from "@/lib/customerLegalEntities";

/**
 * Реквізити замовника для договору, СП і акта замовлення (картки 340 і 341).
 *
 * Два джерела: юрособа картки замовника й знімок, який замовлення зробило при
 * створенні. Поки СП не підписано, виграє картка — виправлене там одразу
 * потрапляє в документ. Підписана СП (і акт до неї) друкується так, як її
 * підписали: першим іде знімок, картка лише заповнює порожнечі.
 *
 * Підписаний договір сюди не входить: його текст лежить у версіях договору. А
 * нова СП під уже підписаним договором якраз має взяти виправлене в картці — саме
 * з такої СП («ТОВ БОН ФРУКТ» без лапок) почалась картка 340.
 */
export type OrderRequisitesSnapshot = {
  legalEntityLabel?: string | null;
  taxId?: string | null;
  iban?: string | null;
  bankDetails?: string | null;
  legalAddress?: string | null;
  /** «ПІБ, посада» — так замовлення зберігає підписанта. */
  signatoryLabel?: string | null;
  signatoryAuthority?: string | null;
};

/** Поля самої картки (не юрособи) і ліда — останній запас. */
export type OrderRequisitesFallback = {
  legalName?: string | null;
  taxId?: string | null;
  iban?: string | null;
  signatoryName?: string | null;
  signatoryPosition?: string | null;
};

export type OrderRequisites = {
  entity: CustomerLegalEntity | null;
  legalEntityLabel: string | null;
  taxId: string | null;
  vatId: string | null;
  vatRate: string | null;
  iban: string | null;
  bankDetails: string | null;
  legalAddress: string | null;
  signatoryName: string | null;
  signatoryPosition: string | null;
  signatoryAuthority: string | null;
};

type Signatory = { name: string; position: string; authority: string };

const text = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");
const firstFilled = (...values: (string | null | undefined)[]) => values.map(text).find(Boolean) || null;
const personKey = (value: string) => value.toLowerCase().replace(/\s+/g, " ");

/**
 * Підписант — одна людина з одного джерела. Посаду й підставу добираємо лише в
 * джерел, де стоїть та сама людина: інакше в договорі вийде новий ПІБ зі старою
 * посадою й довіреністю попереднього підписанта.
 */
function pickSignatory(sources: Signatory[]) {
  const chosen = sources.find((source) => source.name);
  if (!chosen) return { name: null, position: null, authority: null };
  const samePerson = sources.filter((source) => source.name && personKey(source.name) === personKey(chosen.name));
  return {
    name: chosen.name,
    position: samePerson.map((source) => source.position).find(Boolean) || null,
    authority: samePerson.map((source) => source.authority).find(Boolean) || null,
  };
}

export function resolveOrderRequisites(input: {
  entities: CustomerLegalEntity[];
  snapshot: OrderRequisitesSnapshot;
  customer?: OrderRequisitesFallback | null;
  lead?: OrderRequisitesFallback | null;
  /** СП замовлення вже підписана. */
  signed: boolean;
}): OrderRequisites {
  const { snapshot, customer, lead, signed } = input;
  const entity = pickOrderLegalEntity(input.entities, { taxId: snapshot.taxId, label: snapshot.legalEntityLabel });

  const fromCard = {
    label: entity && text(entity.legalName) ? formatCustomerLegalEntityTitle(entity) : "",
    taxId: entity?.taxId,
    iban: entity?.iban,
    bankDetails: entity?.bankName,
    legalAddress: entity?.legalAddress,
  };
  const fromSnapshot = {
    label: snapshot.legalEntityLabel,
    taxId: snapshot.taxId,
    iban: snapshot.iban,
    bankDetails: snapshot.bankDetails,
    legalAddress: snapshot.legalAddress,
  };
  const [primary, secondary] = signed ? [fromSnapshot, fromCard] : [fromCard, fromSnapshot];

  const [snapshotName = "", ...snapshotPosition] = (snapshot.signatoryLabel ?? "").split(",");
  const cardSignatory: Signatory = {
    name: text(entity?.signatoryName),
    position: text(entity?.signatoryPosition),
    authority: text(entity?.signatoryAuthority),
  };
  const snapshotSignatory: Signatory = {
    name: snapshotName.trim(),
    position: snapshotPosition.join(",").trim(),
    authority: text(snapshot.signatoryAuthority),
  };
  const signatory = pickSignatory([
    ...(signed ? [snapshotSignatory, cardSignatory] : [cardSignatory, snapshotSignatory]),
    { name: text(customer?.signatoryName), position: text(customer?.signatoryPosition), authority: "" },
    { name: text(lead?.signatoryName), position: text(lead?.signatoryPosition), authority: "" },
  ]);

  return {
    entity,
    legalEntityLabel: firstFilled(primary.label, secondary.label, customer?.legalName),
    taxId: firstFilled(primary.taxId, secondary.taxId, customer?.taxId),
    vatId: firstFilled(entity?.vatId),
    vatRate: entity?.vatRate || null,
    iban: firstFilled(primary.iban, secondary.iban, customer?.iban),
    bankDetails: firstFilled(primary.bankDetails, secondary.bankDetails),
    legalAddress: firstFilled(primary.legalAddress, secondary.legalAddress),
    signatoryName: signatory.name,
    signatoryPosition: signatory.position,
    signatoryAuthority: signatory.authority,
  };
}
