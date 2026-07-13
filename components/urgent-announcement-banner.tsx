"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { announcementPlainText } from "@/lib/announcement-content";

type ApiAnnouncement = { id: string | number; title: string; body?: string; content?: string; priority?: string; published_at?: string | number; publishedAt?: string | number };
type UrgentAnnouncement = { id: string; title: string; body: string };
type ModuleNode = { key: string; enabled?: boolean; effectiveEnabled?: boolean; submodules?: ModuleNode[] };

export function UrgentAnnouncementBanner({ enabled }: { enabled: boolean }) {
  const [announcement, setAnnouncement] = useState<UrgentAnnouncement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    Promise.all([
      fetch("/api/modules", { cache: "no-store", credentials: "same-origin", signal: controller.signal }),
      fetch("/api/announcements", { cache: "no-store", credentials: "same-origin", signal: controller.signal }),
    ])
      .then(async ([modulesResponse, announcementsResponse]) => ({
        modules: modulesResponse.ok ? (await modulesResponse.json() as { modules?: ModuleNode[] }).modules ?? [] : [],
        announcements: announcementsResponse.ok ? (await announcementsResponse.json() as { announcements?: ApiAnnouncement[] }).announcements ?? [] : [],
      }))
      .then(({ modules, announcements }) => {
        const nodes = modules.flatMap((module) => [module, ...(module.submodules ?? [])]);
        const feed = nodes.find((module) => module.key === "announcements.feed");
        if (!feed || (feed.effectiveEnabled ?? feed.enabled) === false) return;
        const latest = announcements.filter((item) => item.priority === "urgent").sort((a, b) => new Date(b.publishedAt ?? b.published_at ?? 0).getTime() - new Date(a.publishedAt ?? a.published_at ?? 0).getTime())[0];
        if (!latest || window.sessionStorage.getItem(`dismissed-urgent-announcement-v2:${latest.id}`)) return;
        setAnnouncement({ id: String(latest.id), title: latest.title, body: latest.body ?? latest.content ?? "" });
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setAnnouncement(null); });
    return () => controller.abort();
  }, [enabled]);

  if (!enabled || !announcement) return null;
  const summary = announcementPlainText(announcement.body);
  const dismiss = () => {
    window.sessionStorage.setItem(`dismissed-urgent-announcement-v2:${announcement.id}`, "1");
    setAnnouncement(null);
  };

  return <aside className="urgent-announcement" aria-label="Comunicado urgente">
    <span className="urgent-announcement__icon"><AlertTriangle /></span>
    <div className="urgent-announcement__content"><span>Comunicado urgente</span><strong>{announcement.title}</strong><p>{summary.length > 180 ? `${summary.slice(0, 177)}…` : summary}</p></div>
    <Link href="/avisos">Ler comunicado <ArrowRight /></Link>
    <button type="button" onClick={dismiss} aria-label={`Descartar comunicado urgente: ${announcement.title}`}><X /></button>
  </aside>;
}
