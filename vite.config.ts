import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const ALLOWED_HOSTS = new Set(["v9ky.in.ua", "r-cup.com.ua", "sfck.com.ua"]);

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    command === "serve"
      ? {
          name: "dev-fetch-v9ky-standings",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/api/fetch-v9ky-standings") return next();
              if (req.method !== "POST") {
                res.statusCode = 405;
                res.end("Method Not Allowed");
                return;
              }

              let body = "";
              req.on("data", (chunk) => {
                body += chunk.toString();
              });
              req.on("end", async () => {
                try {
                  const payload = JSON.parse(body || "{}");
                  const url = payload?.url;
                  if (typeof url !== "string") {
                    res.statusCode = 400;
                    res.end("Missing url");
                    return;
                  }

                  const parsed = new URL(url);
                  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
                    res.statusCode = 400;
                    res.end("URL host not allowed");
                    return;
                  }

                  const response = await fetch(parsed.toString(), {
                    headers: {
                      "User-Agent": USER_AGENT,
                      Accept: "text/html,*/*",
                    },
                  });

                  if (!response.ok) {
                    res.statusCode = response.status;
                    res.end(
                      `Failed to fetch ${parsed.toString()}: ${response.status} ${response.statusText}`,
                    );
                    return;
                  }

                  const html = await response.text();
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "text/html; charset=utf-8");
                  res.end(html);
                } catch (error) {
                  res.statusCode = 500;
                  res.end(error instanceof Error ? error.message : "Unknown error");
                }
              });
            });
          },
        }
      : undefined,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const pkgPath = id.split("node_modules/")[1] ?? "";

          if (
            pkgPath === "react" ||
            pkgPath.startsWith("react/") ||
            pkgPath.startsWith("react-dom") ||
            pkgPath.startsWith("react-router")
          ) {
            return "vendor-react";
          }

          if (pkgPath.startsWith("@supabase/")) {
            return "vendor-supabase";
          }

          if (
            pkgPath.startsWith("@radix-ui/") ||
            pkgPath.startsWith("cmdk") ||
            pkgPath.startsWith("sonner") ||
            pkgPath.startsWith("react-day-picker")
          ) {
            return "vendor-ui";
          }

          if (
            pkgPath.startsWith("date-fns") ||
            pkgPath.startsWith("lucide-react") ||
            pkgPath.startsWith("recharts") ||
            pkgPath.startsWith("@tabler/icons-react")
          ) {
            return "vendor-viz";
          }

          return "vendor";
        },
      },
    },
  },
}));
