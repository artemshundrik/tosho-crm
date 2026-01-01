export const ROLE_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  super_admin: {
    label: "Super Admin",
    className: "bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-500/20",
  },
  manager: {
    label: "Менеджер",
    className: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-500/20",
  },
  viewer: {
    label: "Глядач",
    className: "bg-slate-500/10 text-slate-700 border-slate-200 dark:text-slate-400 dark:border-slate-500/20",
  },
  player: {
    label: "Гравець",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-500/20",
  },
};

export const ROLE_TEXT_CLASSES: Record<string, string> = {
  super_admin: "text-purple-600 dark:text-purple-400",
  manager: "text-blue-600 dark:text-blue-400",
  viewer: "text-slate-600 dark:text-slate-400",
  player: "text-emerald-600 dark:text-emerald-400",
};
