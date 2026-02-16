import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { WorkspacePresenceState } from "@/hooks/useWorkspacePresenceState";

const WorkspacePresenceContext = createContext<WorkspacePresenceState | null>(null);

type WorkspacePresenceProviderProps = {
  value: WorkspacePresenceState;
  children: ReactNode;
};

export function WorkspacePresenceProvider({ value, children }: WorkspacePresenceProviderProps) {
  return <WorkspacePresenceContext.Provider value={value}>{children}</WorkspacePresenceContext.Provider>;
}

export function useWorkspacePresence() {
  const context = useContext(WorkspacePresenceContext);
  if (!context) {
    throw new Error("useWorkspacePresence must be used within WorkspacePresenceProvider");
  }
  return context;
}
