type ThemeMode = "light" | "dark";

const AGENCY_LOGO_PATHS: Record<ThemeMode, string> = {
  light: "/brand/logo/logo-light.svg",
  dark: "/brand/logo/logo-dark.svg",
};

export const getAgencyLogo = (theme: ThemeMode) => AGENCY_LOGO_PATHS[theme];

/**
 * Повний лок-ап із рядком «Brand Experience & Production» — для шапки документів,
 * які їдуть замовнику.
 *
 * ОКРЕМО ВІД `getAgencyLogo`, бо це різні знаки, а не розміри одного. Дескриптор
 * читабельний десь від 40 px; у підвалі документа, де лого стоїть на 15 px, він
 * перетворюється на пляму — там свідомо стоїть чистий вордмарк.
 */
export const getAgencyLockup = () => "/brand/logo/logo-lockup.png";
