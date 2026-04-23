import { cn } from "@/lib/utils";

export type ToShoAiLauncherVariant = "nova" | "glow" | "glass";

type ToShoAiLauncherButtonProps = {
  onClick: () => void;
  className?: string;
  variant?: ToShoAiLauncherVariant;
  previewLabel?: string | null;
};

function ToShoAiGlyph() {
  return (
    <svg
      viewBox="0 0 33 33"
      className="tosho-ai-launcher__glyph"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M13.9446 6.46076C14.2193 5.34828 15.8008 5.34828 16.0754 6.46076C17.2477 11.2094 20.9555 14.9171 25.7041 16.0893C26.8167 16.3639 26.8167 17.9455 25.7041 18.2201C20.9555 19.3924 17.2477 23.1 16.0754 27.8487C15.8008 28.9611 14.2193 28.9611 13.9446 27.8487C12.7723 23.1 9.06455 19.3924 4.31589 18.2201C3.20337 17.9455 3.20337 16.3639 4.31589 16.0893C9.06455 14.9171 12.7723 11.2094 13.9446 6.46076Z"
        fill="currentColor"
      />
      <path
        d="M25.6579 1.74675C25.7691 1.29646 26.4092 1.29646 26.5204 1.74675C26.9949 3.66882 28.4957 5.16953 30.4177 5.64401C30.868 5.75518 30.868 6.39533 30.4177 6.50649C28.4957 6.98097 26.9949 8.48169 26.5204 10.4038C26.4092 10.854 25.7691 10.854 25.6579 10.4038C25.1834 8.48169 23.6827 6.98097 21.7606 6.50649C21.3103 6.39533 21.3103 5.75518 21.7606 5.64401C23.6827 5.16953 25.1834 3.66882 25.6579 1.74675Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ToShoAiLauncherButton({
  onClick,
  className,
  variant = "nova",
  previewLabel = null,
}: ToShoAiLauncherButtonProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      {previewLabel ? <span className="tosho-ai-launcher-preview-label">{previewLabel}</span> : null}
      <button
        type="button"
        onClick={onClick}
        aria-label="Відкрити ToSho AI"
        className={cn("tosho-ai-launcher", `tosho-ai-launcher--${variant}`, className)}
      >
        <span className="tosho-ai-launcher__liquid tosho-ai-launcher__liquid--one" aria-hidden="true" />
        <span className="tosho-ai-launcher__liquid tosho-ai-launcher__liquid--two" aria-hidden="true" />
        <span className="tosho-ai-launcher__liquid tosho-ai-launcher__liquid--three" aria-hidden="true" />
        <span className="tosho-ai-launcher__shine" aria-hidden="true" />

        <span className="tosho-ai-launcher__symbol" aria-hidden="true">
          <ToShoAiGlyph />
        </span>

        <span className="tosho-ai-launcher__label" aria-hidden="true">
          <span className="tosho-ai-launcher__title">ToSho AI</span>
          <span className="tosho-ai-launcher__subtitle">Шо треба?</span>
        </span>
      </button>
    </div>
  );
}
