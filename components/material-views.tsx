"use client";
import { Eye } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/material-catalog.module.css";

export function MaterialViews({ count }: { count?: number | null }) {
  const { t, locale } = useI18n();
  if (count == null) return null;
  const label = t(count === 1 ? "community.materials.views.one" : "community.materials.views.count", { count: count.toLocaleString(locale) });
  return <span className={styles.views} aria-label={label} title={t("community.materials.views.rule")}><Eye aria-hidden="true" /><span aria-hidden="true">{count.toLocaleString(locale)}</span></span>;
}
