import { supabase } from "@/lib/supabaseClient";

type ThemeMode = "light" | "dark";

const AGENCY_LOGO_PATHS: Record<ThemeMode, string> = {
  light: "public/brand/logo/logo-light.svg",
  dark: "public/brand/logo/logo-dark.svg",
};

export const getAgencyLogo = (theme: ThemeMode) => {
  const { data } = supabase.storage.from("public-assets").getPublicUrl(AGENCY_LOGO_PATHS[theme]);
  return data.publicUrl;
};
