import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Button, FormField, Input, Textarea } from "tosho-crm";

export function Opened() {
  return (
    <div className="min-h-[520px] p-4">
      <Dialog open modal={false}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Новий прорахунок</DialogTitle>
            <DialogDescription>Заповни замовника — решту можна пізніше.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FormField label="Замовник" required><Input placeholder="Почни вводити назву" /></FormField>
            <FormField label="Коментар"><Textarea rows={2} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="ghost">Скасувати</Button><Button>Створити</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
