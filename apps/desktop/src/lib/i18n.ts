import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

import { loadUiPrefs, type AppLocale } from "./ui-prefs";

export type { AppLocale };

function isTauriWebview(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function fetchLocaleFromDevServer(lang: AppLocale): Promise<Record<string, unknown>> {
  const res = await fetch(`/locales/${lang}.json`);
  if (!res.ok) {
    throw new Error(`Failed to load /locales/${lang}.json (${res.status})`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function loadLocaleJson(lang: AppLocale): Promise<Record<string, unknown>> {
  if (isTauriWebview()) {
    try {
      const text = await invoke<string>("read_locale_file", { lang });
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      // 资源路径异常或 dev 环境未就绪时，回退到 Vite 提供的 public/locales（与 tauri dev 同源）
      return fetchLocaleFromDevServer(lang);
    }
  }
  return fetchLocaleFromDevServer(lang);
}

/** 从 Tauri 资源目录（或 dev 下 public/locales）加载词条后初始化 i18n；须在 render 前 await。 */
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
