import webpush from "web-push";

type AdminClient = {
  from: (table: string) => {
    insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
    select: (columns: string) => {
      in: (column: string, values: string[]) => {
        is: (column: string, value: null) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

type NotificationInsertRow = {
  user_id: string;
  title: string;
  body: string | null;
  href: string | null;
  type: "info" | "success" | "warning";
};

type PushSubscriptionRow = {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  disabled_at?: string | null;
};

export async function deliverNotifications(adminClient: AdminClient, rows: NotificationInsertRow[]) {
  if (rows.length === 0) {
    return { delivered: 0, pushDelivered: 0, pushFailed: 0 };
  }

  const { error } = await adminClient.from("notifications").insert(rows);
  if (error) throw new Error(error.message);

  const vapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:hello@tosho.agency";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return { delivered: rows.length, pushDelivered: 0, pushFailed: 0 };
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from("push_subscriptions")
    .select("endpoint,user_id,p256dh,auth,disabled_at")
    .in("user_id", userIds)
    .is("disabled_at", null);

  if (subscriptionsError) {
    return { delivered: rows.length, pushDelivered: 0, pushFailed: 0 };
  }

  const subscriptionsByUserId = new Map<string, PushSubscriptionRow[]>();
  for (const row of ((subscriptions ?? []) as PushSubscriptionRow[])) {
    const list = subscriptionsByUserId.get(row.user_id) ?? [];
    list.push(row);
    subscriptionsByUserId.set(row.user_id, list);
  }

  let pushDelivered = 0;
  let pushFailed = 0;

  for (const row of rows) {
    const userSubscriptions = subscriptionsByUserId.get(row.user_id) ?? [];
    for (const subscription of userSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: row.title,
            body: row.body ?? "",
            href: row.href ?? "/notifications",
            tag: row.href ?? `notification:${row.user_id}`,
          })
        );
        pushDelivered += 1;
      } catch (pushError) {
        pushFailed += 1;
        const statusCode =
          typeof pushError === "object" &&
          pushError !== null &&
          "statusCode" in pushError &&
          typeof (pushError as { statusCode?: unknown }).statusCode === "number"
            ? Number((pushError as { statusCode?: unknown }).statusCode)
            : null;
        if (statusCode === 404 || statusCode === 410) {
          await adminClient
            .from("push_subscriptions")
            .update({ disabled_at: new Date().toISOString() })
            .eq("endpoint", subscription.endpoint);
        }
      }
    }
  }

  return { delivered: rows.length, pushDelivered, pushFailed };
}

