import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

import {
  THEME_CHANGE_EVENT,
  type ThemeChangeDetail,
  type ThemePreference,
  applyResolvedTheme,
  applyThemeWithTransition,
  isThemeTransitionInFlight,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  subscribeToSystemTheme,
  systemPrefersDark,
} from "@/lib/theme";

/**
 * Стан теми для перемикача та для всіх, кому треба знати, що зараз намальовано.
 *
 * ЧОМУ БЕЗ КОНТЕКСТУ. Перемикачів у застосунку два — у шапці й у мобільному
 * меню, — і вони мають показувати одне й те саме. Джерело правди тут не React,
 * а сам документ: клас на <html> і запис у localStorage. Хук лише дзеркалить
 * його й переслуховує подію THEME_CHANGE_EVENT, тож будь-яка кількість
 * екземплярів синхронна без провайдера над половиною застосунку.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference());
  const [prefersDark, setPrefersDark] = useState<boolean>(() => systemPrefersDark());

  const resolved = resolveTheme(preference, prefersDark);

  // Стеження за системою потрібне ЗАВЖДИ, а не лише в режимі «системна»:
  // інакше, повернувшись у цей режим, застосунок показував би стан ОС на
  // момент останнього перемикання.
  useEffect(() => subscribeToSystemTheme(setPrefersDark), []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ThemeChangeDetail>).detail;
      if (!detail?.preference) return;
      // Поки йде хвиля — оновлюємось СИНХРОННО. Подія прилітає зсередини
      // зворотного виклику переходу, і звичайне оновлення React відклав би на
      // свій планувальник: шапка з логотипом перемалювалась би вже після того,
      // як браузер зняв кадр «після», і логотип стрибав би поверх анімації.
      // Поза хвилею (зміна теми в ОС) синхронність не потрібна, а flushSync у
      // цей момент може прийтись на фазу ефектів — тому й перевірка.
      if (isThemeTransitionInFlight()) {
        flushSync(() => setPreferenceState(detail.preference));
        return;
      }
      setPreferenceState(detail.preference);
    };
    window.addEventListener(THEME_CHANGE_EVENT, handler);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
  }, []);

  // Тримає документ у злагоді зі станом: перший рендер і зміна теми в ОС.
  // Ідемпотентна — при виборі руками клас уже стоїть (його поставила анімація
  // переходу), тож повторної події тут не буде.
  useEffect(() => {
    applyResolvedTheme(preference, resolved);
  }, [preference, resolved]);

  const setPreference = useCallback(
    (next: ThemePreference, origin?: { x: number; y: number } | null) => {
      storeThemePreference(next);
      // Стан МІНЯЄТЬСЯ ВСЕРЕДИНІ переходу й синхронно (flushSync), а не тут:
      // інакше React встигає перемалювати іконку кнопки, логотип і шапку до
      // того, як браузер зніме кадр «до», і хвиля виходить ні з чого ні в що.
      // Разом із класом теми це одна зміна вигляду — тож і кадр один.
      applyThemeWithTransition(next, resolveTheme(next, systemPrefersDark()), origin, () => {
        flushSync(() => setPreferenceState(next));
      });
    },
    []
  );

  return { preference, resolved, setPreference };
}
