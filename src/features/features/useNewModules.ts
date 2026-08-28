import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
 * ЧОМУ ЗАПИТ, А НЕ ЕФЕКТ ЗІ СТАНОМ. Перша редакція тримала множину в useState і
 * заповнювала її з useEffect — тобто ще одне `setState` в ефекті (правило
 * react-hooks/set-state-in-effect) і `eslint-disable` на залежностях, бо масив
 * ключів щорендеру новий. Обидві заглушки зупинив ратчет перед пушем, і
 * правильно: те саме робить useQuery, у якого ключ — рядок ключів, а гасіння —
 * звичайна мутація з оптимістичним оновленням кешу.
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
  const queryClient = useQueryClient();
  // Масив щорендеру новий, тож ключем запиту йде рядок — інакше кожен рендер
  // читався б як нові дані.
  const signature = availableKeys.join(",");

  const seen = useQuery({
    queryKey: ["seen-modules", userId, signature],
    enabled: Boolean(userId) && availableKeys.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const workspaceId = await resolveWorkspaceId(userId as string);
      if (!workspaceId) return { workspaceId: null, keys: new Set<string>(), seeded: true };
      const result = await loadSeenModules({
        workspaceId,
        userId: userId as string,
        availableKeys,
      });
      return { workspaceId, keys: result.keys, seeded: result.seeded };
    },
  });

  const markSeen = useMutation({
    mutationFn: async (moduleKey: ModuleKey) => {
      const workspaceId = seen.data?.workspaceId;
      if (!workspaceId || !userId) return;
      await markModulesSeen({ workspaceId, userId, moduleKeys: [moduleKey] });
    },
    onMutate: (moduleKey) => {
      // Мітка гасне одразу, не чекаючи мережі: людина вже пішла в розділ.
      queryClient.setQueryData(
        ["seen-modules", userId, signature],
        (current: { workspaceId: string | null; keys: Set<string>; seeded: boolean } | undefined) =>
          current ? { ...current, keys: new Set(current.keys).add(moduleKey) } : current
      );
    },
    onError: (error) => {
      console.warn("[sidebar] failed to remember visited module", error);
    },
  });

  const newKeys = useMemo(() => {
    // Перший вхід: пам'ять щойно засіяна, нового немає за визначенням.
    if (!seen.data || seen.data.seeded) return new Set<ModuleKey>();
    // Розбираємо той самий рядок, що йде ключем запиту, — так у залежностях
    // немає масиву, який щорендеру новий, і заглушка на правила хуків не
    // потрібна.
    const keys = signature ? (signature.split(",") as ModuleKey[]) : [];
    return new Set(newModuleKeys(keys, seen.data.keys));
  }, [seen.data, signature]);

  return {
    newKeys,
    markSeen: useCallback((moduleKey: ModuleKey) => markSeen.mutate(moduleKey), [markSeen]),
  };
}
