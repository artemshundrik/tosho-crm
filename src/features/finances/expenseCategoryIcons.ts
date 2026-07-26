import {
  Briefcase,
  Building2,
  Car,
  Coffee,
  CreditCard,
  Droplet,
  Gift,
  GraduationCap,
  Landmark,
  Megaphone,
  Package,
  Palette,
  PartyPopper,
  Receipt,
  Repeat,
  ShoppingCart,
  SprayCan,
  Truck,
  Users,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ExpenseCategoryKind } from "./types";

// Expense categories are free-form per team, so icons are derived from the name
// (keyword match, most specific first) with a per-kind fallback. Purely visual —
// nothing is stored, and unknown names still get a sensible icon.
const NAME_ICON_RULES: Array<{ test: RegExp; icon: LucideIcon }> = [
  { test: /маркетинг|реклам|промо|smm|таргет|\bads?\b/, icon: Megaphone },
  { test: /подарунк|квіт|презент|букет|gift|flower/, icon: Gift },
  { test: /корпоратив|свят|поді[їя]|народженн|тімбілд/, icon: PartyPopper },
  // Вода — ВИЩЕ за «комунал…|вода», інакше питна вода отримала б іконку електрики.
  { test: /вода|кулер|бутильован/, icon: Droplet },
  // Продукти/смаколики — ВИЩЕ за «оренд|офіс», інакше «продукти в офіс» → будівля.
  { test: /продукт|смаколик|снек|кухн|бакалі/, icon: Coffee },
  { test: /кондиціонер|клімат/, icon: Wrench },
  { test: /прибир|клінінг|чист/, icon: SprayCan },
  { test: /оренд|офіс|приміщ/, icon: Building2 },
  { test: /дизайн|програм|софт|підписк|ліценз|adobe|figma|subscription|saas/, icon: Palette },
  { test: /пошт|достав|логіст|перевіз|shipping|delivery/, icon: Truck },
  { test: /матеріал|сировин|друк|папір|фурнітур|витратн/, icon: Package },
  { test: /зв.?язок|інтернет|телефон|мобільн|hosting|хостинг|домен/, icon: Wifi },
  { test: /комунал|світло|електр|вода|опаленн|енерг/, icon: Zap },
  { test: /банк|комісі|еквайр|розрахунк/, icon: CreditCard },
  { test: /податок|пдв|єсв|збір/, icon: Landmark },
  { test: /зарплат|виплат|команд|оплата прац|фоп/, icon: Users },
  { test: /транспорт|паливо|бензин|авто|таксі/, icon: Car },
  { test: /навчанн|курс|тренінг|освіт/, icon: GraduationCap },
  { test: /юрид|бухгалт|консульт|аутсорс/, icon: Briefcase },
  { test: /ремонт|обладнан|інструмент|техобслуг|технік/, icon: Wrench },
  { test: /закуп|товар|магазин/, icon: ShoppingCart },
];

const KIND_FALLBACK_ICON: Record<ExpenseCategoryKind, LucideIcon> = {
  fixed: Repeat,
  variable: Package,
  tax: Landmark,
  payroll: Users,
};

export function getExpenseCategoryIcon(name: string, kind: ExpenseCategoryKind): LucideIcon {
  const normalized = name.trim().toLowerCase();
  for (const rule of NAME_ICON_RULES) {
    if (rule.test.test(normalized)) return rule.icon;
  }
  return KIND_FALLBACK_ICON[kind] ?? Receipt;
}
