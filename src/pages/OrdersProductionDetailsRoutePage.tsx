import { useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import OrdersProductionDetailsPage from "@/pages/OrdersProductionDetailsPage";

export default function OrdersProductionDetailsRoutePage() {
  const { id } = useParams();
  const { teamId, loading, session } = useAuth();

  if (!id) {
    return <div className="p-6 text-sm text-muted-foreground">Невірний ідентифікатор.</div>;
  }

  if (loading) {
    return <AppPageLoader title="Завантаження" subtitle="Відкриваємо замовлення." />;
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

  return <OrdersProductionDetailsPage />;
}
