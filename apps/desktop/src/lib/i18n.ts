import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

import { loadUiPrefs, type AppLocale } from "./ui-prefs";

export type { AppLocale };

function isTauriWebview(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function loadLocaleJson(lang: AppLocale): Promise<Record<string, unknown>> {
  if (!isTauriWebview()) {
    throw new Error(
      "界面词条由 Tauri 从打包资源加载。请使用 `pnpm tauri dev` 或运行桌面应用，不要单独 `pnpm dev` 在浏览器中调试完整 UI。",
    );
  }
  const text = await invoke<string>("read_locale_file", { lang });
  return JSON.parse(text) as Record<string, unknown>;
}

/** 从 Tauri `bundle.resources`（`read_locale_file`）加载词条；须在 render 前 await。 */
export async function bootstrapI18n(): Promise<void> {
  const prefs = loadUiPrefs();
  const [zh, en] = await Promise.all([
    loadLocaleJson("zh"),
    loadLocaleJson("en"),
  ]);

  await i18n.use(initReactI18next).init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    lng: prefs.locale,
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
