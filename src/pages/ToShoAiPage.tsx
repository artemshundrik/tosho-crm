import { ToShoAiConsole } from "@/features/tosho-ai/ToShoAiConsole";
import { buildToShoAiRouteContext, readToShoAiLastContext } from "@/lib/toshoAi";

export default function ToShoAiPage() {
  const lastContext =
    readToShoAiLastContext() ??
    buildToShoAiRouteContext({
      pathname: "/tosho-ai",
      title: "ToSho AI",
    });

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top_left,hsl(var(--accent)/0.12),transparent_45%),radial-gradient(circle_at_top_right,hsl(var(--info)/0.12),transparent_42%)]" />
      <div className="relative">
        <ToShoAiConsole surface="page" initialContext={lastContext} />
      </div>
    </div>
  );
}
