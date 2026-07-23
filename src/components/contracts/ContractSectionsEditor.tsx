import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/contracts/RichTextEditor";
import { sanitizeContractHtml } from "@/lib/sanitizeContractHtml";
import type { ContractSection } from "@/features/contractRevisions/contractSections";

type Props = {
  sections: ContractSection[];
  onChange: (next: ContractSection[]) => void;
  disabled?: boolean;
};

const customSectionId = () =>
  `custom-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10)}`;

export const ContractSectionsEditor = ({ sections, onChange, disabled }: Props) => {
  const [pendingNewTitle, setPendingNewTitle] = useState("");

  const updateSection = (index: number, patch: Partial<ContractSection>) => {
    const next = sections.map((section, idx) =>
      idx === index
        ? {
            ...section,
            ...patch,
            ...(patch.bodyHtml !== undefined ? { bodyHtml: sanitizeContractHtml(patch.bodyHtml) } : {}),
          }
        : section
    );
    onChange(next);
  };

  const addCustomSection = () => {
    const title = pendingNewTitle.trim();
    if (!title) return;
    onChange([
      ...sections,
      {
        id: customSectionId(),
        title,
        bodyHtml: "<p></p>",
        isCore: false,
      },
    ]);
    setPendingNewTitle("");
  };

  const removeCustomSection = (index: number) => {
    const section = sections[index];
    if (section.isCore) return;
    onChange(sections.filter((_, idx) => idx !== index));
  };

  return (
    <div className="space-y-4">
      {sections.map((section, index) => (
        <Card key={section.id} className="border-border/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full px-2 py-0 text-3xs">
                {index + 1}
              </Badge>
              {section.isCore ? (
                <div className="text-sm font-semibold text-foreground">{section.title}</div>
              ) : (
                <Input
                  value={section.title}
                  onChange={(event) => updateSection(index, { title: event.target.value })}
                  disabled={disabled}
                  className="h-8 text-sm font-semibold"
                />
              )}
              {!section.isCore ? (
                <Badge variant="outline" className="rounded-full px-2 py-0 text-3xs text-muted-foreground">
                  Власний пункт
                </Badge>
              ) : null}
            </div>
            {!section.isCore ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeCustomSection(index)}
                disabled={disabled}
                aria-label="Видалити пункт"
                title="Видалити пункт"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <RichTextEditor
            value={section.bodyHtml}
            onChange={(html) => updateSection(index, { bodyHtml: html })}
            disabled={disabled}
            ariaLabel={`Зміст пункту ${index + 1}: ${section.title}`}
          />
        </Card>
      ))}

      <Card className="border-dashed border-border/60 p-4">
        <div className="mb-2 text-sm font-semibold text-foreground">Додати власний пункт</div>
        <div className="text-xs text-muted-foreground">
          Існуючі пункти 1–8 видалити не можна — лише редагувати їх зміст. Можна дописати додаткові пункти у кінець.
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={pendingNewTitle}
            onChange={(event) => setPendingNewTitle(event.target.value)}
            placeholder="Назва пункту, напр. «Гарантійні зобов’язання»"
            disabled={disabled}
            className="h-9"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomSection();
              }
            }}
          />
          <Button type="button" onClick={addCustomSection} disabled={disabled || pendingNewTitle.trim().length === 0}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Додати
          </Button>
        </div>
      </Card>
    </div>
  );
};
