import * as React from "react";
import { PartyCardContext, type OpenPartyCard, type PartyCardSavedResult, type PartyCardTarget } from "./partyCardContext";

const PartyCardHost = React.lazy(() => import("./PartyCardHost"));

export type PartyCardRequest = {
  nonce: number;
  target: PartyCardTarget;
  onSaved?: (result: PartyCardSavedResult) => void;
};

export function PartyCardProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<PartyCardRequest | null>(null);
  const nonceRef = React.useRef(0);

  const openParty = React.useCallback<OpenPartyCard>((target, options) => {
    nonceRef.current += 1;
    setRequest({ nonce: nonceRef.current, target, onSaved: options?.onSaved });
  }, []);

  return (
    <PartyCardContext.Provider value={openParty}>
      {children}
      {/* Хост лишається змонтованим після першого відкриття: другий клік не
          чекає ні на чанк, ні на список команди. */}
      {request ? (
        <React.Suspense fallback={null}>
          <PartyCardHost request={request} />
        </React.Suspense>
      ) : null}
    </PartyCardContext.Provider>
  );
}
