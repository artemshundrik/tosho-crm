import { useCallback, useEffect, useRef, useState } from "react";

import { resolveWorkspaceId } from "@/lib/workspace";
import type { ModuleKey } from "@/lib/moduleAccess";
import { loadSeenModules, markModulesSeen } from "@/features/features/seenModules";
import { newModuleKeys } from "@/features/features/newModules";

/**
 * Які пункти меню для цієї людини нові — і як їх погасити (REQ-199).
 *
 * Мітка гасне за фактом відвідування, а не за кліком по самій мітці: інакше
 * позначки накопичуються в людини, яка просто ходить по CRM, і за тиждень
 * перестають означати будь-що.
 *
 * Помилки тут мовчазні. Меню — не те місце, де можна впасти: без цієї пам'яті
 * сайдбар просто не показує міток, і це нікому не заважає.
 */
export function useNewModules(params: {
  userId: string | null | undefined;
  /** Пункти, доступні людині просто зараз. */
  availableKeys: ModuleKey[];
}) {
  const { userId, availableKeys } = params;
  const [newKeys, setNewKeys] = useState<Set<ModuleKey>>(() => new Set());
  const contextRef = useRef<{ workspaceId: string; userId: string } | null>(null);
  // Список пунктів міняється щорендер (новий масив), тож у залежності йде
  // рядок: інакше ефект ходив би в мережу без кінця.
  const availableSignature = availableKeys.join(",");

  useEffect(() => {
    if (!userId || availableKeys.length === 0) return;
    let cancelled = false;

    void (async () => {
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId || cancelled) return;
        contextRef.current = { workspaceId, userId };
        const seen = await loadSeenModules({ workspaceId, userId, availableKeys });
        if (cancelled) return;
        // Перший вхід: пам'ять щойно засіяна, нового немає за визначенням.
        setNewKeys(seen.seeded ? new Set() : new Set(newModuleKeys(availableKeys, seen.keys)));
      } catch (error) {
        console.warn("[sidebar] seen modules unavailable", error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, availableSignature]);

  /** Людина відкрила розділ — мітка гасне одразу, запис іде слідом. */
  const markSeen = useCallback((moduleKey: ModuleKey) => {
    setNewKeys((prev) => {
      if (!prev.has(moduleKey)) return prev;
      const next = new Set(prev);
      next.delete(moduleKey);
      return next;
    });
    const context = contextRef.current;
    if (!context) return;
    void markModulesSeen({ ...context, moduleKeys: [moduleKey] }).catch((error) => {
      console.warn("[sidebar] failed to remember visited module", error);
    });
  }, []);

  return { newKeys, markSeen };
}
