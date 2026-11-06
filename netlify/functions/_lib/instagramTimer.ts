// Таймер заявок: нагадування й передача. Живе в reminders-dispatch, а не окремим
// кроном і окремою функцією: без простроченої заявки це один запит кожні 5 хвилин.
import { createClient } from "@supabase/supabase-js";

import { assertCronAuthorized } from "../_cronAuth";
import { runTimerTick } from "./instagramRequests";

type HttpEvent = { headers?: Record<string, string | undefined> };

export const handler = async (event: HttpEvent) => {
  const denied = assertCronAuthorized(event);
  if (denied) return denied;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { statusCode: 500, body: "Missing Supabase env vars" };
  const summary = await runTimerTick(createClient(url, key, { auth: { persistSession: false } }), new Date());
  return { statusCode: 200, body: JSON.stringify(summary) };
};
