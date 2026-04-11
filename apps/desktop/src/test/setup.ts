import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "@testing-library/jest-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zhPath = path.resolve(
  __dirname,
  "../../../../src-tauri/resources/locales/zh.json",
);
const zh = JSON.parse(fs.readFileSync(zhPath, "utf-8")) as Record<
  string,
  unknown
>;

await i18n.use(initReactI18next).init({
  lng: "zh",
  resources: { zh: { translation: zh } },
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});
