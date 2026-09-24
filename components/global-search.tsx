"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, BookOpen, Building2, CalendarDays, FileText, GraduationCap, MapPinned, Megaphone, Search, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import { SurfaceHeader } from "@/components/surface-header";
import styles from "@/components/community-suite.module.css";
import list from "@/components/record-list.module.css";
import { RecordSkeleton } from "@/components/record-list";

type Result = { id: string; type: string; title: string; description: string; href: string; meta?: string };
type ApiResult = { id: string | number; type?: string; title?: string; name?: string; description?: string; excerpt?: string; href?: string; url?: string; meta?: string; createdAt?: string };

const labelKeys = {
  class: "search.type.class",
  announcement: "search.type.announcement",
  curricular_unit: "search.type.curricularUnit",
  document: "search.type.document",
  material: "search.type.material",
  member: "search.type.member",
  event: "search.type.event",
  poll: "search.type.poll",
  request: "search.type.request",
  campus_building: "search.type.campusBuilding",
  campus_room: "search.type.campusRoom",
  faculty: "search.type.faculty",
} as const;

function normalize(item: ApiResult, fallbackTitle: string): Result {
  const type = item.type ?? "content";
  return {
    id: String(item.id),
    type,
    title: item.title ?? item.name ?? fallbackTitle,
    description: item.description ?? item.excerpt ?? "",
    href: item.href ?? item.url ?? "/",
    meta: item.meta ?? item.createdAt,
  };
}

function resultIcon(type: string) {
  if (type === "class") return <Users />;
  if (type.includes("announcement")) return <Megaphone />;
  if (type.includes("unit")) return <BookOpen />;
  if (type.includes("member") || type.includes("user")) return <Users />;
  if (type.includes("faculty")) return <GraduationCap />;
  if (type.includes("building")) return <Building2 />;
  if (type.includes("room") || type.includes("campus")) return <MapPinned />;
  if (type.includes("event")) return <CalendarDays />;
  return <FileText />;
}

export function GlobalSearch() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const initial = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(Boolean(initial));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!submitted.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/search?q=${encodeURIComponent(submitted.trim())}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { results?: ApiResult[]; items?: ApiResult[]; error?: string };
        if (!response.ok) throw new Error(data.error || t("search.error"));
        setResults((data.results ?? data.items ?? []).map((item) => normalize(item, t("search.fallbackResult"))));
      })
      .catch((reason) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : t("search.error"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [submitted, t]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    setSubmitted(value);
    const url = value ? `/pesquisa?q=${encodeURIComponent(value)}` : "/pesquisa";
    window.history.replaceState(null, "", url);
  };

  const labelFor = (type: string) => {
    const key = labelKeys[type as keyof typeof labelKeys];
    return key ? t(key) : type || t("search.type.content");
  };

  return <AuthGuard><ModuleGuard moduleKey="search.global"><AppShell active="search" breadcrumb={t("search.breadcrumb")}><div className={styles.page}>
    <SurfaceHeader standalone headingLevel="h1" icon={<Search />} eyebrow={t("search.eyebrow")} title={t("search.title")} />
    {error && <AppToast kind="error" message={error} onDismiss={() => setError("")} />}
    <section className={`panel ${list.listPanel}`} aria-busy={loading}>
      <form className={styles.toolbar} onSubmit={submit} role="search"><label className={styles.search}><Search /><span className="sr-only">{t("search.term")}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.placeholder")} maxLength={160} /></label><button className="button button--primary button--compact" type="submit" disabled={!query.trim() || loading}><Search />{t("search.submit")}</button></form>
      {loading ? <RecordSkeleton label={t("search.loading")} />
        : !submitted ? <div className={list.empty}><Search /><strong>{t("search.initial.title")}</strong></div>
          : results.length === 0 ? <div className={list.empty}><Search /><strong>{t("search.empty.title", { query: submitted })}</strong></div>
            : <ul className={list.rows} aria-label={t("search.results.title", { query: submitted })}>{results.map((item) => <li className={list.row} key={`${item.type}-${item.id}`}>
              <span className={list.rowIcon} aria-hidden="true">{resultIcon(item.type)}</span>
              <div className={list.rowMain}>
                <h3><Link className={`link-quiet ${list.titleLink}`} href={item.href}>{item.title}</Link></h3>
                <p className={list.rowMeta}>{[labelFor(item.type), item.description || item.meta].filter(Boolean).join(" · ")}</p>
              </div>
              <ArrowRight className={styles.resultArrow} aria-hidden="true" />
            </li>)}</ul>}
    </section>
  </div></AppShell></ModuleGuard></AuthGuard>;
}
