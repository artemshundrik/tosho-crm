import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { StackOverview } from "@/features/stack/StackOverview";

/**
 * «Стек» — четвертий пункт розділу Dev поруч із Беклогом, Релізами і Здоровʼям.
 *
 * ЧОМУ ТУТ, А НЕ В «ЗДОРОВʼЇ». Здоровʼя відповідає «що зараз не працює» —
 * бекапи, cron, storage, тобто події. Стек відповідає «з чого це зроблено й що
 * застаріло» — стан, який не міняється щогодини. Змішані в одному екрані вони
 * заважали б одне одному так само, як релізи заважали стрічці «Що нового».
 *
 * ГЕЙТ ТОЙ САМИЙ, ЩО В РЕЛІЗАХ: власник або SEO. Він не додає прав, а лише
 * тримає сторінку в згоді з RLS — політика на tosho.stack_versions і функція
 * tosho.get_stack_platform стоять на тому самому предикаті, тож решті команди
 * сторінка все одно віддала б порожнечу.
 */
export default function StackPage() {
  const { accessRole, jobRole } = useAuth();

  const canSee =
    (accessRole ?? "").trim().toLowerCase() === "owner" || (jobRole ?? "").trim().toLowerCase() === "seo";

  if (!canSee) return <Navigate to="/whats-new" replace />;

  return (
    // Без власного верхнього відступу: каркас уже дає pt-6, а смуги дій у цього
    // розділу немає — вкладки живуть у тілі сторінки, як у макеті REQ-116.
    <div className="pb-10">
      <div className="mx-auto max-w-[1180px]">
        <StackOverview />
      </div>
    </div>
  );
}
