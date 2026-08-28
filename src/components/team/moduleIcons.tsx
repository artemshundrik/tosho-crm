/**
 * Іконка модуля — та сама, що стоїть біля пункту в бічному меню.
 *
 * ЧОМУ НЕ В РЕЄСТРІ. `src/lib/moduleAccess.ts` — чиста логіка без React і без
 * бібліотеки іконок: його імпортують і netlify-функції, і тести. Затягнути туди
 * `lucide-react` означало б тягнути UI у шар правил. Тому карта лежить окремо,
 * а реєстр лишається джерелом правди про самі модулі.
 *
 * ЧОМУ ВЗАГАЛІ ІКОНКИ. Редактор доступів малює меню людини — те саме, яке вона
 * побачить. Меню без іконок не є тим меню: людина впізнає пункти саме за ними,
 * і без них макет перестає відповідати на питання «що вона побачить».
 *
 * Шість ключів меню не мають (`payroll` — вкладка всередині Фінансів, `pulse`
 * і `dev` живуть інакше, «Логістику» з меню прибрали 2026-08-05). Їм дано
 * іконку за змістом розділу — інакше в списку зʼявились би дірки.
 */

import {
  Activity,
  Banknote,
  BriefcaseBusiness,
  Building2,
  Calculator,
  Factory,
  FileSignature,
  FolderKanban,
  GitPullRequestArrow,
  KeyRound,
  LayoutGrid,
  Megaphone,
  Package,
  Palette,
  Plug,
  Route,
  Send,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { ModuleKey } from "@/lib/moduleAccess";

export const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  overview: LayoutGrid,
  customers: Building2,
  quotes: Calculator,
  orders: Factory,
  shipping: Truck,
  catalog: FolderKanban,
  logistics: Route,
  design: Palette,
  contractors: BriefcaseBusiness,
  stock: Package,
  marketing: Megaphone,
  finance: Banknote,
  payroll: Wallet,
  vchasno: FileSignature,
  vchasno_send: Send,
  team: Users,
  members_access: KeyRound,
  nova_poshta: Plug,
  pulse: Activity,
  dev: GitPullRequestArrow,
};

/** Ключі без власного пункту меню — їх підпис уточнюємо, щоб не збрехати. */
export const MODULES_WITHOUT_MENU_ITEM: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  "payroll",
  "logistics",
  "pulse",
]);
