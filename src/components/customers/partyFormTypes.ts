import type { CustomerDeliveryPoint } from "@/lib/customerDeliveryPoints";
import type { CustomerLegalEntity } from "@/lib/customerLegalEntities";
import type { ImageUploadMode } from "@/types/catalog";

/**
 * Стан картки замовника й ліда: те, чим користуються створення, бічна панель
 * і сторінка замовника, а запис перетворює на колонки (`partyCardSave.ts`).
 */

export type { CustomerLegalEntity } from "@/lib/customerLegalEntities";
export type { CustomerDeliveryPoint } from "@/lib/customerDeliveryPoints";

export type CustomerPaymentType = "invoice" | "cash";

export type CustomerContact = {
  name: string;
  position: string;
  phone: string;
  email: string;
  birthday: string;
  telegram: string;
};

export type CustomerFormState = {
  name: string;
  paymentType: CustomerPaymentType;
  source: string;
  /** Хто порекомендував — коли джерело «Рекомендація». */
  referredBy?: string;
  manager: string;
  managerId: string;
  website: string;
  logoUrl: string;
  logoFile: File | null;
  logoUploadMode: ImageUploadMode;
  legalEntities: CustomerLegalEntity[];
  contacts: CustomerContact[];
  deliveryPoints: CustomerDeliveryPoint[];
  reminderDate: string;
  reminderTime: string;
  reminderComment: string;
  eventName: string;
  eventDate: string;
  eventComment: string;
  notes: string;
  accountantName: string;
  accountantEmail: string;
  accountantEdrpou: string;
};

export type CustomerLinkedItem = {
  id: string;
  number?: string | null;
  title?: string | null;
  status?: string | null;
  total?: number | null;
  subtitle?: string | null;
  created_at?: string | null;
};

export type LeadFormState = {
  companyName: string;
  paymentType: CustomerPaymentType;
  legalName: string;
  ownershipType: string;
  firstName: string;
  lastName: string;
  email: string;
  phones: string[];
  /** Нік без «@» або з ним — на запис нормалізується (REQ-298). */
  telegram: string;
  source: string;
  /** Хто порекомендував — коли джерело «Рекомендація». */
  referredBy?: string;
  website: string;
  logoUrl: string;
  logoFile: File | null;
  logoUploadMode: ImageUploadMode;
  manager: string;
  managerId: string;
  taxId: string;
  legalAddress: string;
  iban: string;
  signatoryName: string;
  signatoryPosition: string;
  reminderDate: string;
  reminderTime: string;
  reminderComment: string;
  eventName: string;
  eventDate: string;
  eventComment: string;
  notes: string;
  deliveryPoints: CustomerDeliveryPoint[];
};
