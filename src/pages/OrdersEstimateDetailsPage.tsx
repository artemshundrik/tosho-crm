import { useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { QuoteDetailsPage } from "@/pages/QuoteDetailsPage";

export default function OrdersEstimateDetailsPage() {
  const { id } = useParams();
  const { teamId, session } = useAuth();

  if (!id) {
    return <div className="p-6 text-sm text-muted-foreground">Невірний ідентифікатор.</div>;
  }

  // Гейта на auth loading тут немає свідомо: поки він true, RequireAuth малює
  // оболонку застосунку, і жодна сторінка не монтується. Дубль лише додавав ще
  // один кадр із лоадером (REQ-19).
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
