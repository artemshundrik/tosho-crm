import * as React from "react";
import { UnsavedChangesPrompt } from "tosho-crm";
export function Opened() {
  return (
    <div className="min-h-[380px] p-4">
      <UnsavedChangesPrompt open onDismiss={() => {}} onDiscard={() => {}} />
    </div>
  );
}
