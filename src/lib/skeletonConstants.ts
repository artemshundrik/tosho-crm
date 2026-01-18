/**
 * Константи для skeleton loading компонентів
 * Синхронізовані з CSS змінними в index.css
 */
export const SKELETON_CONSTANTS = {
  /** Мінімальний час показу skeleton (ms) */
  MIN_DURATION_MS: 80,
  /** Час переходу між станами (ms) */
  TRANSITION_MS: 80,
} as const;

/**
 * Уніфіковані розміри для skeleton елементів
 * Використовуйте ці константи для консистентності на всіх сторінках
 */
export const SKELETON_SIZES = {
  /** Висота для заголовків */
  HEADER_HEIGHT: "h-6",
  /** Висота для підзаголовків */
  SUBHEADER_HEIGHT: "h-4",
  /** Висота для KPI карток */
  KPI_HEIGHT: "h-24",
  /** Висота для карток контенту */
  CARD_HEIGHT: "h-[240px]",
  /** Висота для рядків списку */
  ROW_HEIGHT: "h-14",
  /** Висота для маленьких рядків */
  ROW_SMALL_HEIGHT: "h-12",
  /** Висота для великих карток */
  CARD_LARGE_HEIGHT: "h-[220px]",
} as const;

/**
 * Уніфіковані rounded значення для skeleton
 */
export const SKELETON_RADIUS = {
  /** Для KPI та внутрішніх елементів */
  INNER: "rounded-[var(--radius-inner)]",
  /** Для секцій та великих карток */
  SECTION: "rounded-[var(--radius-section)]",
  /** Для базових елементів */
  BASE: "rounded-[var(--radius-md)]",
} as const;
