import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { QuotesPage } from "@/pages/QuotesPage";

export default function OrdersEstimatesPage() {
  const { teamId, loading, session } = useAuth();

  if (loading) {
    return <AppPageLoader title="Завантаження" subtitle="Відкриваємо прорахунки." />;
  }

  if (!session) {
    return <div className="p-6 text-sm text-destructive">User not authenticated</div>;
  }

  if (!teamId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Немає доступної команди. Перевір членство або інвайт.
      </div>
    );
  }

  return <QuotesPage teamId={teamId} />;
}
