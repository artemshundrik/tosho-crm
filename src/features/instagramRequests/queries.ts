import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

import { DEFAULT_WORK_HOURS, type CloseReason, type RequestAccessShape, type WorkHours } from "./rules";

/**
 * Читання йде напряму: заявки ріже RLS. Усякий запис лише через функцію
 * instagram-requests, бо передача, таймер і надсилання мають сходитись в одному місці.
 *
 * Таблиці ще не в database.types.ts, тому тут вільний клієнт: типи рядків нижче.
 */
const tosho = () => (supabase as unknown as SupabaseClient).schema("tosho");

export type RequestRow = RequestAccessShape & {
  id: string;
  team_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  assigned_at: string | null;
  handover_due_at: string | null;
  reminder_due_at: string | null;
  round: number;
  is_overdue: boolean;
  first_response_at: string | null;
  first_response_minutes: number | null;
  first_response_by: string | null;
  close_reason: CloseReason | null;
  closed_at: string | null;
  lead_id: string | null;
  customer_id: string | null;
  party_name: string | null;
  company_name: string | null;
  contact: string | null;
  ad_title: string | null;
  last_client_message_at: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "in" | "out" | null;
  last_message_sender_id: string | null;
  awaiting_reply: boolean;
  auto_replied_at: string | null;
  is_test: boolean;
  created_at: string;
};

export type MessageRow = {
  id: string;
  request_id: string;
  direction: "in" | "out";
  source: "client" | "crm" | "ig_app" | "auto_reply";
  body: string;
  attachments: unknown;
  sender_user_id: string | null;
  send_status: "pending" | "sent" | "failed";
  send_error: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  request_id: string;
  kind: string;
  from_user_id: string | null;
  to_user_id: string | null;
  actor_user_id: string | null;
  note: string | null;
  created_at: string;
};

export type SettingsRow = {
  reminder_minutes: number;
  handover_minutes: number;
  work_start_hour: number;
  work_end_hour: number;
  auto_reply_text: string;
  other_reviewer_user_id: string | null;
  round_excluded_user_ids: string[];
};

export const DEFAULT_SETTINGS: SettingsRow = {
  reminder_minutes: 15,
  handover_minutes: 30,
  work_start_hour: DEFAULT_WORK_HOURS.startHour,
  work_end_hour: DEFAULT_WORK_HOURS.endHour,
  auto_reply_text: "Дякуємо, що написали! Менеджер відповість у робочий час, з 9:00 до 18:00.",
  other_reviewer_user_id: null,
  round_excluded_user_ids: [],
};

export const hoursOf = (settings: SettingsRow): WorkHours => ({
  startHour: settings.work_start_hour,
  endHour: settings.work_end_hour,
});

export const requestKeys = {
  all: ["instagram-requests"] as const,
  list: () => [...requestKeys.all, "list"] as const,
  one: (id: string) => [...requestKeys.all, "one", id] as const,
  messages: (id: string) => [...requestKeys.all, "messages", id] as const,
  events: (id: string) => [...requestKeys.all, "events", id] as const,
  settings: () => [...requestKeys.all, "settings"] as const,
  members: () => [...requestKeys.all, "members"] as const,
};

const LIST_LIMIT = 500;

export function useRequestsList() {
  return useQuery({
    queryKey: requestKeys.list(),
    queryFn: async (): Promise<RequestRow[]> => {
      const { data, error } = await tosho()
        .from("instagram_requests")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(LIST_LIMIT);
      if (error) throw error;
      return (data ?? []) as RequestRow[];
    },
  });
}

/** Окремо від списку: посилання зі сповіщення може вести на заявку за межами останніх 500. */
export function useRequest(id: string | null) {
  return useQuery({
    queryKey: requestKeys.one(id ?? "none"),
    enabled: Boolean(id),
    queryFn: async (): Promise<RequestRow | null> => {
      const { data, error } = await tosho().from("instagram_requests").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as RequestRow | null) ?? null;
    },
  });
}

export function useRequestMessages(id: string | null) {
  return useQuery({
    queryKey: requestKeys.messages(id ?? "none"),
    enabled: Boolean(id),
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await tosho()
        .from("instagram_messages")
        .select("id,request_id,direction,source,body,attachments,sender_user_id,send_status,send_error,created_at")
        .eq("request_id", id!)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });
}

export function useRequestEvents(id: string | null) {
  return useQuery({
    queryKey: requestKeys.events(id ?? "none"),
    enabled: Boolean(id),
    queryFn: async (): Promise<EventRow[]> => {
      const { data, error } = await tosho()
        .from("instagram_request_events")
        .select("id,request_id,kind,from_user_id,to_user_id,actor_user_id,note,created_at")
        .eq("request_id", id!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });
}

export function useRequestSettings() {
  return useQuery({
    queryKey: requestKeys.settings(),
    queryFn: async (): Promise<SettingsRow> => {
      const { data, error } = await tosho()
        .from("instagram_settings")
        .select("reminder_minutes,handover_minutes,work_start_hour,work_end_hour,auto_reply_text,other_reviewer_user_id,round_excluded_user_ids")
        .maybeSingle();
      if (error) throw error;
      return (data as SettingsRow | null) ?? DEFAULT_SETTINGS;
    },
  });
}

export function useRequestMembers(userId: string | null) {
  return useQuery({
    queryKey: requestKeys.members(),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<WorkspaceMemberDisplayRow[]> => {
      const workspaceId = await resolveWorkspaceId(userId!);
      return workspaceId ? await listWorkspaceMembersForDisplay(workspaceId) : [];
    },
  });
}

export class RequestActionError extends Error {
  readonly status: number;
  /** Повідомлення вже записане як не надіслане: текст із поля можна прибирати. */
  readonly messageId: string | null;

  constructor(message: string, status: number, messageId: string | null) {
    super(message);
    this.status = status;
    this.messageId = messageId;
  }
}

export type RequestAction = { action: string } & Record<string, unknown>;

export async function callRequests<T = { ok: true; requestId?: string }>(payload: RequestAction): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new RequestActionError("Сесія завершилась. Увійдіть знову.", 401, null);
  const response = await fetch("/.netlify/functions/instagram-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string; messageId?: string };
  if (!response.ok) {
    throw new RequestActionError(body.error || "Не вдалося виконати дію", response.status, body.messageId ?? null);
  }
  return body as T;
}

/** Дія з заявкою: показує помилку людською й перечитує все, що могло змінитись. */
export function useRequestAction(options?: { quiet?: boolean }) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: RequestAction) => callRequests(payload),
    onError: (error: unknown) => {
      if (!options?.quiet) toast.error(error instanceof Error ? error.message : "Не вдалося виконати дію");
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}
