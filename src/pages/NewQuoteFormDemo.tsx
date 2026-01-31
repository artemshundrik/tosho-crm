import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NewQuoteDialog } from "@/components/quotes";
import type { NewQuoteFormData } from "@/components/quotes";
import { Plus } from "lucide-react";
import { toast } from "sonner";

/**
 * Demo page for the new Linear-style Quote Form
 * This is a standalone page to showcase the new form design
 */
export function NewQuoteFormDemo() {
  const [open, setOpen] = useState(false);

  const handleSubmit = (data: NewQuoteFormData) => {
    console.log("Form submitted:", data);
    toast.success("Прорахунок створено!", {
      description: `Статус: ${data.status}, Тип: ${data.quoteType}`,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Нова форма прорахунку</h1>
          <p className="text-lg text-muted-foreground">
            Linear-style дизайн для створення прорахунків
          </p>
        </div>

        {/* Demo card */}
        <div className="rounded-[var(--radius-inner)] border border-border bg-card p-8 space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Особливості дизайну</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>
                  <strong>Chips/Pills:</strong> Компактні кнопки з іконками, напівпрозорим фоном та subtle borders
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>
                  <strong>Секції:</strong> Чіткий поділ на секції з мінімалістичними заголовками
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>
                  <strong>Динамічні поля:</strong> Додавання/видалення нанесень, завантаження файлів
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>
                  <strong>Каскадні селекти:</strong> Категорія → Вид → Модель
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>
                  <strong>Темна тема:</strong> Використання існуючої кольорової схеми проєкту
                </span>
              </li>
            </ul>
          </div>

          <div className="pt-4 border-t border-border/40">
            <Button
              onClick={() => setOpen(true)}
              size="lg"
              className="w-full gap-2"
            >
              <Plus className="h-4 w-4" />
              Відкрити форму
            </Button>
          </div>
        </div>

        {/* Info card */}
        <div className="rounded-[var(--radius-md)] border border-border/40 bg-muted/20 p-6 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Наступні кроки
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Інтегрувати з існуючим API для клієнтів та менеджерів</li>
            <li>• Підключити каталог продукції для каскадних селектів</li>
            <li>• Додати валідацію форми (обов'язкові поля)</li>
            <li>• Реалізувати збереження в базу даних</li>
            <li>• Додати завантаження файлів на сервер</li>
          </ul>
        </div>

        {/* Reference images note */}
        <div className="text-center text-xs text-muted-foreground">
          Дизайн базується на Linear App (див. референсні зображення)
        </div>
      </div>

      {/* The Dialog */}
      <NewQuoteDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        teamId="demo-team-id"
      />
    </div>
  );
}
