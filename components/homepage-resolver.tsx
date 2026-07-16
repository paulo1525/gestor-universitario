"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Boxes, LoaderCircle, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { useModules } from "@/components/module-context";

export function HomepageResolver() {
  const router = useRouter();
  const { t } = useI18n();
  const { home, loading, error, refresh } = useModules();

  useEffect(() => {
    if (!loading && !error && home?.href && home.href !== "/") router.replace(home.href);
  }, [error, home?.href, loading, router]);

  if (loading || home?.href) {
    return <main className="auth-loading"><LoaderCircle className="spin" size={28} /><strong>{t("guard.preparing")}</strong></main>;
  }

  if (error) {
    return <main className="auth-loading auth-loading--denied" role="alert"><Boxes size={28} /><div><strong>{t("home.loadError")}</strong><button className="button button--secondary button--compact" type="button" onClick={() => void refresh()}><RefreshCw size={14} />{t("home.retry")}</button></div></main>;
  }

  return <main className="auth-loading auth-loading--denied" role="status"><Boxes size={28} /><div><strong>{t("home.noModulesTitle")}</strong><span>{t("home.noModulesDescription")}</span></div></main>;
}
