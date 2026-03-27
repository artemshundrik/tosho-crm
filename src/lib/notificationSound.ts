const NOTIFICATION_SOUND_SRC = "/sounds/notification.wav";

let notificationAudio: HTMLAudioElement | null = null;

export type NotificationSoundResult = {
  ok: boolean;
  message: string;
};

export async function playNotificationSound(options?: { force?: boolean }): Promise<NotificationSoundResult> {
  const force = options?.force ?? false;

  if (typeof window === "undefined") {
    return { ok: false, message: "window недоступний" };
  }

  if (!force && document.visibilityState !== "visible") {
    return { ok: false, message: "Вкладка неактивна" };
  }

  try {
    if (!notificationAudio) {
      notificationAudio = new Audio(NOTIFICATION_SOUND_SRC);
      notificationAudio.preload = "auto";
    }

    notificationAudio.pause();
    notificationAudio.currentTime = 0;
    notificationAudio.muted = false;
    notificationAudio.volume = 1;

    await notificationAudio.play();
    return { ok: true, message: "Спрацював audio-файл" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "audio.play() не спрацював";
    return { ok: false, message };
  }
}
