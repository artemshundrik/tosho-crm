import { useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { QuoteDetailsPage } from "@/pages/QuoteDetailsPage";

export default function OrdersEstimateDetailsPage() {
  const { id } = useParams();
  const { teamId, loading, session } = useAuth();

  if (!id) {
    return <div className="p-6 text-sm text-muted-foreground">Невірний ідентифікатор.</div>;
  }

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

  return <QuoteDetailsPage teamId={teamId} quoteId={id} />;
}
