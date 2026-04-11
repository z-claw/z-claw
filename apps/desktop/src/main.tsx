import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@workspace/ui/globals.css";
import { bootstrapI18n } from "./lib/i18n";
import App from "./App.tsx";
import { ThemeProvider } from "@/components/theme-provider.tsx";

void bootstrapI18n().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>,
  );
});
