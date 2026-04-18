type ThemeMode = "light" | "dark";

const AGENCY_LOGO_PATHS: Record<ThemeMode, string> = {
  light: "/brand/logo/logo-light.svg",
  dark: "/brand/logo/logo-dark.svg",
};

export const getAgencyLogo = (theme: ThemeMode) => AGENCY_LOGO_PATHS[theme];
