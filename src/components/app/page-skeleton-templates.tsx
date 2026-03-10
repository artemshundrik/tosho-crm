import { AppPageLoader } from "@/components/app/AppPageLoader";

export function DashboardSkeleton() {
  return <AppPageLoader title="Завантаження CRM" subtitle="Готуємо робочий простір." />;
}

export function ListSkeleton() {
  return <AppPageLoader title="Завантаження" subtitle="Готуємо список." />;
}

export function DetailSkeleton() {
  return <AppPageLoader title="Завантаження" subtitle="Готуємо деталі сторінки." />;
}
