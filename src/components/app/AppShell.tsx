export function AppShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-[28px] border border-border bg-card p-5 text-center shadow-surface">
        <div className="text-base font-semibold text-foreground">Завантаження CRM</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Перевіряємо сесію та відкриваємо робочий простір.
        </div>
      </div>
    </div>
  );
}
