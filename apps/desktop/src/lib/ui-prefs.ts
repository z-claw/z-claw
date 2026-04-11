const STORAGE_KEY = "z-claw.ui.v1";

export type FeedTab = "chat" | "log";

export type AppLocale = "zh" | "en";

export type UiPrefsV1 = {
  lastSessionId: string | null;
  feedTab: FeedTab;
  inspectorTab: string;
  locale: AppLocale;
};

const defaults: UiPrefsV1 = {
  lastSessionId: null,
  feedTab: "chat",
  inspectorTab: "memory",
  locale: "zh",
};

export function loadUiPrefs(): UiPrefsV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const o = JSON.parse(raw) as Partial<UiPrefsV1>;
    const loc = o.locale === "en" ? "en" : "zh";
    return {
      lastSessionId:
        typeof o.lastSessionId === "string" ? o.lastSessionId : null,
      feedTab: o.feedTab === "log" ? "log" : "chat",
      inspectorTab:
        typeof o.inspectorTab === "string"
          ? o.inspectorTab
          : defaults.inspectorTab,
      locale: loc,
    };
  } catch {
    return { ...defaults };
  }
}

export function saveUiPrefs(patch: Partial<UiPrefsV1>): void {
  const cur = loadUiPrefs();
  const next: UiPrefsV1 = { ...cur, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
