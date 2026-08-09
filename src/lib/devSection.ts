/**
 * Розділ «Dev» — три пункти меню під спільним заголовком.
 *
 * До 2026-08-09 це були три незалежні поверхні в трьох різних місцях: «Запити»
 * в сайдбарі, «Релізи» й Observability — у меню акаунта. Сценарій у них один
 * (упав деплой → дивишся релізи → заводиш беклог → перевіряєш здоровʼя), тож
 * вони зведені в одну групу сайдбару, а старі адреси лишились редиректами.
 *
 * Група стоїть найнижчою: доступ до неї мають двоє, і робота компанії має бути
 * вище за кухню самої CRM.
 */

export type DevSurface = "backlog" | "releases" | "health";

export const DEV_ROOT = "/dev";

export const DEV_PATHS: Record<DevSurface, string> = {
  backlog: `${DEV_ROOT}/backlog`,
  releases: `${DEV_ROOT}/releases`,
  health: `${DEV_ROOT}/health`,
};

export const DEV_LABELS: Record<DevSurface, string> = {
  backlog: "Беклог",
  releases: "Релізи",
  health: "Здоровʼя",
};

/** Яку з трьох поверхонь відкрито. Голий `/dev` веде на беклог. */
export function resolveDevSurface(pathname: string): DevSurface {
  if (pathname.startsWith(DEV_PATHS.releases)) return "releases";
  if (pathname.startsWith(DEV_PATHS.health)) return "health";
  return "backlog";
}
