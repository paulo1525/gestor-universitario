"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  AppLocale,
  formatMessage,
  LANGUAGE_STORAGE_KEY,
  MessageKey,
  normalizeLocale,
  translateBreadcrumb,
} from "@/lib/i18n";

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, parameters?: Record<string, string | number>) => string;
  breadcrumb: (label: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const LANGUAGE_CHANGE_EVENT = "gestor-language-change";

function applyDocumentLocale(locale: AppLocale) {
  document.documentElement.lang = locale;
}

function storedLocale(): AppLocale {
  try {
    return normalizeLocale(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return "pt-PT" as const;
  }
}

function subscribeToLocale(onChange: () => void) {
  const syncStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", syncStorage);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", syncStorage);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    storedLocale,
    (): AppLocale => "pt-PT",
  );

  const setLocale = useCallback((nextLocale: AppLocale) => {
    applyDocumentLocale(nextLocale);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  }, []);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const t = useCallback(
    (key: MessageKey, parameters?: Record<string, string | number>) =>
      formatMessage(locale, key, parameters),
    [locale],
  );
  const breadcrumb = useCallback(
    (label: string) => translateBreadcrumb(label, locale),
    [locale],
  );
  const value = useMemo(
    () => ({ locale, setLocale, t, breadcrumb }),
    [breadcrumb, locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
