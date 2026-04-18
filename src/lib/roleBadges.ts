export const ROLE_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  super_admin: {
    label: "Super Admin",
    className: "tone-accent",
  },
  manager: {
    label: "Менеджер",
    className: "tone-info",
  },
  viewer: {
    label: "Глядач",
    className: "tone-neutral",
  },
  player: {
    label: "Гравець",
    className: "tone-success",
  },
};

export const ROLE_TEXT_CLASSES: Record<string, string> = {
  super_admin: "tone-text-accent",
  manager: "tone-text-info",
  viewer: "tone-text-neutral",
  player: "tone-text-success",
};
