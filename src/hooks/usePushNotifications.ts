import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import {
  disablePush,
  ensurePushSubscription,
  getPushEnabled,
  getPushPermission,
  hasPushConfig,
  isPushSupported,
  requestAndEnablePush,
} from "@/lib/pushNotifications";

export function usePushNotifications(userId: string | null | undefined) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => getPushPermission());

  const refresh = useCallback(async () => {
    if (!userId || !isPushSupported() || !hasPushConfig()) {
      setEnabled(false);
      setPermission(getPushPermission());
      return;
    }
    setPermission(getPushPermission());
    try {
      if (getPushPermission() === "granted") {
        await ensurePushSubscription(userId);
      }
      const nextEnabled = await getPushEnabled(userId);
      setEnabled(nextEnabled);
    } catch {
      setEnabled(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const result = await requestAndEnablePush(userId);
      setPermission(result.permission);
      setEnabled(Boolean(result.enabled));
      if (result.enabled) {
        toast.success("Browser notifications увімкнено");
      } else if (result.permission === "denied") {
        toast.error("Браузер заблокував сповіщення");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося увімкнути browser notifications");
    } finally {
      setBusy(false);
    }
  }, [userId]);

  const disable = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await disablePush(userId);
      setEnabled(false);
      toast.success("Browser notifications вимкнено");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося вимкнути browser notifications");
    } finally {
      setBusy(false);
    }
  }, [userId]);

  const sendTest = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      toast.error("Немає активної сесії для тесту push");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/.netlify/functions/test-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        delivered?: number;
        pushDelivered?: number;
        pushFailed?: number;
      };
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      toast.success(
        `Тест відправлено: in-app ${data.delivered ?? 0}, push ${data.pushDelivered ?? 0}, failed ${data.pushFailed ?? 0}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося відправити тестовий push");
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    supported: isPushSupported(),
    configured: hasPushConfig(),
    enabled,
    busy,
    permission,
    enable,
    disable,
    sendTest,
    refresh,
  };
}
