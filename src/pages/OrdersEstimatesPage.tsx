import { useAuth } from "@/auth/AuthProvider";
import { QuotesPage } from "@/pages/QuotesPage";

export default function OrdersEstimatesPage() {
  const { teamId, loading, session } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Завантаження...</div>;
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
