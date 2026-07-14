"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, FileText, LoaderCircle, Megaphone, Search, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import styles from "@/components/community-suite.module.css";

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
    <header className={styles.hero}><div className={styles.heroCopy}><span className={styles.heroIcon}><Search /></span><div><span className="eyebrow">{t("search.eyebrow")}</span><h1>{t("search.title")}</h1><p>{t("search.intro")}</p></div></div></header>
    {error && <AppToast kind="error" message={error} onDismiss={() => setError("")} />}
    <section className={styles.panel}>
      <form className={styles.toolbar} onSubmit={submit} role="search"><label className={styles.search}><Search /><span className="sr-only">{t("search.term")}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.placeholder")} maxLength={160} /></label><button className="button button--primary" type="submit" disabled={!query.trim() || loading}>{loading ? <LoaderCircle className={styles.spin} /> : <Search />}{t("search.submit")}</button></form>
      {loading ? <div className={styles.state}><LoaderCircle className={styles.spin} /><strong>{t("search.loading")}</strong></div>
        : !submitted ? <div className={styles.state}><Search /><strong>{t("search.initial.title")}</strong><p>{t("search.initial.body")}</p></div>
          : results.length === 0 ? <div className={styles.state}><Search /><strong>{t("search.empty.title", { query: submitted })}</strong><p>{t("search.empty.body")}</p></div>
            : <><div className={styles.panelHeader}><div><h2>{t("search.results.title", { query: submitted })}</h2><p>{t("search.results.order")}</p></div><span className={styles.count}>{t(results.length === 1 ? "search.results.one" : "search.results.many", { count: results.length })}</span></div><div className={styles.results}>{results.map((item) => <Link className={styles.result} href={item.href} key={`${item.type}-${item.id}`}><span className={styles.resultType}>{resultIcon(item.type)}</span><span><strong>{item.title}</strong><small>{item.description || item.meta || labelFor(item.type) || t("search.type.content")}</small></span><span className={styles.tags}><span className={styles.tag}>{labelFor(item.type)}</span><ArrowRight /></span></Link>)}</div></>}
    </section>
  </div></AppShell></ModuleGuard></AuthGuard>;
}
