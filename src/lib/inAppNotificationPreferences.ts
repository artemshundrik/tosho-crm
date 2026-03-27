export const IN_APP_NOTIFICATIONS_ENABLED_KEY = "tosho_in_app_notifications_enabled";
export const IN_APP_NOTIFICATION_SOUND_ENABLED_KEY = "tosho_in_app_notification_sound_enabled";
export const IN_APP_NOTIFICATION_PREFERENCES_UPDATED_EVENT = "tosho:in-app-notification-preferences-updated";

export type InAppNotificationPreferences = {
  enabled: boolean;
  soundEnabled: boolean;
};

export function readInAppNotificationPreferences(): InAppNotificationPreferences {
  if (typeof window === "undefined") {
    return { enabled: true, soundEnabled: false };
  }

  try {
    const enabledRaw = window.localStorage.getItem(IN_APP_NOTIFICATIONS_ENABLED_KEY);
    const soundRaw = window.localStorage.getItem(IN_APP_NOTIFICATION_SOUND_ENABLED_KEY);

    return {
      enabled: enabledRaw !== "0",
      soundEnabled: soundRaw === "1",
    };
  } catch {
    return { enabled: true, soundEnabled: false };
  }
}

export function writeInAppNotificationPreferences(next: InAppNotificationPreferences) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(IN_APP_NOTIFICATIONS_ENABLED_KEY, next.enabled ? "1" : "0");
    window.localStorage.setItem(IN_APP_NOTIFICATION_SOUND_ENABLED_KEY, next.soundEnabled ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }

  window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATION_PREFERENCES_UPDATED_EVENT, { detail: next }));
}
