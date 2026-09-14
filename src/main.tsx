import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IconContext } from "@phosphor-icons/react";
// Self-host Inter (variable, з cyrillic-сабсетами через unicode-range) замість
// Google Fonts CDN: мінус render-blocking запит до стороннього домену на
// кожен холодний вхід, файли їдуть з нашого ж CDN з fingerprint-кешем.
import "@fontsource-variable/inter";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Не оновлювати при монтуванні якщо дані свіжі
    },
  },
});

// Значки Phosphor за замовчуванням мають розмір 1em; Lucide, з якого переїхали
// (REQ-275), мав 24. Значок без класу розміру лишається таким, яким був.
const ICON_DEFAULTS = { size: 24, weight: "regular", color: "currentColor", mirrored: false } as const;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <IconContext.Provider value={ICON_DEFAULTS}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </IconContext.Provider>,
)
