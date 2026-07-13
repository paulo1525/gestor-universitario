"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, Archive, Bold, CalendarClock, ChevronLeft, ChevronRight, Flag, Italic, Link2, List, ListOrdered, LoaderCircle, Megaphone, Plus, RotateCcw, Search, Send, Underline, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { FormLabel } from "@/components/form-label";
import { ModuleGuard } from "@/components/module-guard";
import { announcementDisplayHtml, announcementPlainText } from "@/lib/announcement-content";
import styles from "@/components/announcements-board.module.css";

type Priority = "normal" | "important" | "urgent";
type AnnouncementStatus = "active" | "scheduled" | "expired" | "archived";
type ApiAnnouncementStatus = AnnouncementStatus | "published";

type ApiAnnouncement = {
  id: string | number;
  title: string;
  body?: string;
  content?: string;
  priority?: Priority;
  status?: ApiAnnouncementStatus;
  author?: { fullName?: string; full_name?: string; commissionPosition?: string; commission_position?: string };
  authorName?: string;
  author_name?: string;
  authorPosition?: string;
  author_position?: string;
  authorPositionLabel?: string;
  author_position_label?: string;
  commissionPosition?: string;
  commission_position?: string;
  publishedAt?: string | number;
  published_at?: string | number;
  createdAt?: string | number;
  created_at?: string | number;
  expiresAt?: string | number | null;
  expires_at?: string | number | null;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  status: AnnouncementStatus;
  authorName: string;
  authorPosition: string;
  publishedAt: string | number;
  expiresAt: string | number | null;
};

type AnnouncementsResponse = {
  announcements?: ApiAnnouncement[];
  canPublish?: boolean;
  can_publish?: boolean;
  capabilities?: { publish?: boolean; archive?: boolean };
  error?: string;
};

type Notice = { kind: ToastKind; message: string };
type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

const PAGE_SIZE = 6;

const priorityLabels: Record<Priority, string> = {
  normal: "Informativo",
  important: "Importante",
  urgent: "Urgente",
};

const statusLabels: Record<AnnouncementStatus, string> = {
  active: "Publicado",
  scheduled: "Agendado",
  expired: "Terminado",
  archived: "Arquivado",
};

function normalizedStatus(item: ApiAnnouncement): AnnouncementStatus {
  if (item.status && item.status !== "published") return item.status;
  const expiry = item.expiresAt ?? item.expires_at;
  return expiry && new Date(expiry).getTime() <= Date.now() ? "expired" : "active";
}

function normalize(item: ApiAnnouncement): Announcement {
  return {
    id: String(item.id),
    title: item.title,
    body: item.body ?? item.content ?? "",
    priority: item.priority ?? "normal",
    status: normalizedStatus(item),
    authorName: item.author?.fullName ?? item.author?.full_name ?? item.authorName ?? item.author_name ?? "Membro da Comissão de Curso",
    authorPosition: item.author?.commissionPosition ?? item.author?.commission_position ?? item.authorPositionLabel ?? item.author_position_label ?? item.authorPosition ?? item.author_position ?? item.commissionPosition ?? item.commission_position ?? "Comissão de Curso",
    publishedAt: item.publishedAt ?? item.published_at ?? item.createdAt ?? item.created_at ?? Date.now(),
    expiresAt: item.expiresAt ?? item.expires_at ?? null,
  };
}

function formatDate(value: string | number) {
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
}

function paginationItems(totalPages: number, currentPage: number): PaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  if (currentPage >= totalPages - 3) return [1, "ellipsis-start", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "ellipsis-start", currentPage - 1, currentPage, currentPage + 1, "ellipsis-end", totalPages];
}

export function AnnouncementsBoard() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [canPublish, setCanPublish] = useState(false);
  const [canArchive, setCanArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [expiresAt, setExpiresAt] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [page, setPage] = useState(1);
  const editorRef = useRef<HTMLDivElement>(null);
  const [minimumExpiry] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/announcements", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json() as AnnouncementsResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os avisos.");
      const publish = data.canPublish ?? data.can_publish ?? data.capabilities?.publish ?? false;
      setAnnouncements((data.announcements ?? []).map(normalize));
      setCanPublish(publish);
      setCanArchive(data.capabilities?.archive ?? false);
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível carregar os avisos." });
    } finally {
      setLoading(false);
    }
  }, []);

  // A função inicia I/O antes de atualizar o estado com a resposta.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const sortedAnnouncements = useMemo(() => [...announcements].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()), [announcements]);
  const authors = useMemo(() => [...new Set(sortedAnnouncements.map(item => item.authorName))].sort((a, b) => a.localeCompare(b, "pt-PT")), [sortedAnnouncements]);
  const filteredAnnouncements = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("pt-PT");
    return sortedAnnouncements.filter(item => {
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (authorFilter !== "all" && item.authorName !== authorFilter) return false;
      if (!query) return true;
      const searchable = [item.title, announcementPlainText(item.body), item.authorName, item.authorPosition, priorityLabels[item.priority]].join(" ").toLocaleLowerCase("pt-PT");
      return searchable.includes(query);
    });
  }, [authorFilter, priorityFilter, searchQuery, sortedAnnouncements]);
  const totalPages = Math.max(1, Math.ceil(filteredAnnouncements.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedAnnouncements = useMemo(() => filteredAnnouncements.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [currentPage, filteredAnnouncements]);
  const pages = useMemo(() => paginationItems(totalPages, currentPage), [currentPage, totalPages]);
  const hasFilters = Boolean(searchQuery.trim() || priorityFilter !== "all" || authorFilter !== "all");
  const resetFilters = () => { setSearchQuery(""); setPriorityFilter("all"); setAuthorFilter("all"); setPage(1); };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || announcementPlainText(body).length < 10) {
      setNotice({ kind: "warning", message: "Preenche o título e o conteúdo do comunicado." });
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/announcements", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), priority, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível publicar o comunicado.");
      setTitle(""); setBody(""); setPriority("normal"); setExpiresAt(""); setEditorOpen(false);
      if (editorRef.current) editorRef.current.innerHTML = "";
      setNotice({ kind: "success", message: "Comunicado publicado com sucesso." });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível publicar o comunicado." });
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (id: string) => {
    setArchivingId(id);
    try {
      const response = await fetch("/api/announcements", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: "archived" }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível arquivar o comunicado.");
      setNotice({ kind: "success", message: "Comunicado arquivado." });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível arquivar o comunicado." });
    } finally {
      setArchivingId(null);
    }
  };

  const format = (command: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList") => {
    editorRef.current?.focus();
    document.execCommand(command);
    setBody(editorRef.current?.innerHTML ?? "");
  };

  const addLink = () => {
    const value = window.prompt("Indica o endereço completo da ligação (https://…)");
    if (!value) return;
    try {
      const url = new URL(value);
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) throw new Error();
      editorRef.current?.focus();
      document.execCommand("createLink", false, value);
      setBody(editorRef.current?.innerHTML ?? "");
    } catch {
      setNotice({ kind: "warning", message: "Indica uma ligação válida iniciada por https://." });
    }
  };

  const bodyLength = announcementPlainText(body).length;

  return <AuthGuard><ModuleGuard moduleKey="announcements.feed"><AppShell active="announcements" breadcrumb="Avisos e comunicados">
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <section className={styles.heading}>
      <div><span className="eyebrow">Comissão de Curso</span><h1>Avisos e comunicados</h1><p>Informação oficial publicada pelos membros da Comissão de Curso.</p></div>
      {canPublish && <button className="button button--primary" type="button" onClick={() => setEditorOpen(current => !current)} aria-expanded={editorOpen} aria-controls="announcement-editor"><Plus />{editorOpen ? "Fechar editor" : "Novo comunicado"}</button>}
    </section>

    {canPublish && editorOpen && <form id="announcement-editor" className={`panel ${styles.editor}`} onSubmit={publish}>
      <header><span className={styles.editorIcon}><Megaphone /></span><div><span className="eyebrow">Publicação oficial</span><h2>Novo comunicado</h2><p>O teu nome e cargo na Comissão de Curso serão associados automaticamente.</p></div></header>
      <div className={styles.formGrid}>
        <label className={styles.titleField}><FormLabel icon={Megaphone}>Título</FormLabel><input value={title} onChange={event => setTitle(event.target.value)} maxLength={140} required placeholder="Ex.: Alteração do horário da aula prática" /></label>
        <label><FormLabel icon={Flag}>Prioridade</FormLabel><select value={priority} onChange={event => setPriority(event.target.value as Priority)}><option value="normal">Informativo</option><option value="important">Importante</option><option value="urgent">Urgente</option></select></label>
        <div className={styles.bodyField}><FormLabel icon={AlignLeft}>Conteúdo</FormLabel><div className={styles.richEditor}>
          <div className={styles.toolbar} role="toolbar" aria-label="Formatação do comunicado">
            <button type="button" onClick={() => format("bold")} aria-label="Negrito" title="Negrito"><Bold /></button>
            <button type="button" onClick={() => format("italic")} aria-label="Itálico" title="Itálico"><Italic /></button>
            <button type="button" onClick={() => format("underline")} aria-label="Sublinhado" title="Sublinhado"><Underline /></button>
            <span />
            <button type="button" onClick={() => format("insertUnorderedList")} aria-label="Lista com marcas" title="Lista com marcas"><List /></button>
            <button type="button" onClick={() => format("insertOrderedList")} aria-label="Lista numerada" title="Lista numerada"><ListOrdered /></button>
            <button type="button" onClick={addLink} aria-label="Adicionar ligação" title="Adicionar ligação"><Link2 /></button>
          </div>
          <div ref={editorRef} className={styles.editable} contentEditable role="textbox" aria-label="Conteúdo" aria-multiline="true" data-placeholder="Escreve a mensagem completa…" onInput={event => setBody(event.currentTarget.innerHTML)} suppressContentEditableWarning />
        </div></div>
        <label><FormLabel icon={CalendarClock} optional>Visível até</FormLabel><input type="datetime-local" value={expiresAt} min={minimumExpiry} onChange={event => setExpiresAt(event.target.value)} /></label>
      </div>
      <footer><span>{bodyLength}/5000 caracteres</span><button className="button button--primary" type="submit" disabled={submitting || bodyLength > 5000}>{submitting ? <LoaderCircle className={styles.spinner} /> : <Send />}{submitting ? "A publicar…" : "Publicar comunicado"}</button></footer>
    </form>}

    {!editorOpen && <section className={`panel ${styles.feed}`} aria-busy={loading}>
      <header className="panel__header"><div><h2>Comunicados recentes</h2><p>Ordenados do mais recente para o mais antigo.</p></div><span className={styles.count}>{hasFilters ? `${filteredAnnouncements.length} de ${announcements.length}` : filteredAnnouncements.length} {filteredAnnouncements.length === 1 ? "comunicado" : "comunicados"}</span></header>
      <div className={styles.filters} aria-label="Filtros dos comunicados">
        <label className={styles.searchField}><FormLabel icon={Search}>Pesquisar</FormLabel><div><Search /><input type="search" value={searchQuery} onChange={event => { setSearchQuery(event.target.value); setPage(1); }} placeholder="Título, conteúdo, autor ou cargo" /></div></label>
        <label><FormLabel icon={Flag}>Prioridade</FormLabel><select value={priorityFilter} onChange={event => { setPriorityFilter(event.target.value as Priority | "all"); setPage(1); }}><option value="all">Todas</option><option value="urgent">Urgente</option><option value="important">Importante</option><option value="normal">Informativo</option></select></label>
        <label><FormLabel icon={UserRound}>Autor</FormLabel><select value={authorFilter} onChange={event => { setAuthorFilter(event.target.value); setPage(1); }}><option value="all">Todos os autores</option>{authors.map(author => <option value={author} key={author}>{author}</option>)}</select></label>
        <button className={styles.resetFilters} type="button" onClick={resetFilters} disabled={!hasFilters}><RotateCcw />Limpar filtros</button>
      </div>
      {loading ? <div className={styles.loading}><LoaderCircle className={styles.spinner} /><strong>A carregar comunicados…</strong></div> : announcements.length === 0 ? <div className={styles.empty}><Megaphone /><strong>Ainda não existem comunicados.</strong><span>Os avisos oficiais da Comissão de Curso aparecerão aqui.</span></div> : filteredAnnouncements.length === 0 ? <div className={styles.empty}><Search /><strong>Sem comunicados com estes filtros.</strong><span>Altera a pesquisa ou limpa os filtros para voltar a ver todos.</span><button className="button" type="button" onClick={resetFilters}><RotateCcw />Limpar filtros</button></div> : <>
      <div className={styles.resultsSummary} aria-live="polite"><span>A mostrar {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredAnnouncements.length)}–{Math.min(currentPage * PAGE_SIZE, filteredAnnouncements.length)} de {filteredAnnouncements.length}</span><span>Página {currentPage} de {totalPages}</span></div>
      <div className={styles.list}>
        {paginatedAnnouncements.map(item => <article className={`${styles.card} ${styles[`priority_${item.priority}`]} ${item.status === "archived" ? styles.archived : ""}`} key={item.id}>
          <div className={styles.cardRail}><Megaphone /></div>
          <div className={styles.cardContent}>
            <header><div className={styles.badges}><span className={styles.priority}>{priorityLabels[item.priority]}</span><span className={`${styles.status} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span></div>{canArchive && item.status !== "archived" && <button className={styles.archiveButton} type="button" onClick={() => void archive(item.id)} disabled={archivingId === item.id}><Archive />{archivingId === item.id ? "A arquivar…" : "Arquivar"}</button>}</header>
            <h3>{item.title}</h3>
            <div className={styles.body} dangerouslySetInnerHTML={{ __html: announcementDisplayHtml(item.body) }} />
            <footer>
              <span className={styles.author}><UserRound /><span><strong>{item.authorName}</strong><small>{item.authorPosition}</small></span></span>
              <span className={styles.date}><CalendarClock /><span><strong>{formatDate(item.publishedAt)}</strong>{item.expiresAt && <small>Visível até {formatDate(item.expiresAt)}</small>}</span></span>
            </footer>
          </div>
        </article>)}
      </div>
      <nav className={styles.pagination} aria-label="Paginação dos comunicados">
        <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="Página anterior"><ChevronLeft /></button>
        <div>{pages.map(item => typeof item === "number" ? <button type="button" key={item} className={item === currentPage ? styles.activePage : ""} aria-current={item === currentPage ? "page" : undefined} aria-label={`Página ${item}`} onClick={() => setPage(item)}>{item}</button> : <span key={item} aria-hidden="true">…</span>)}</div>
        <button type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label="Página seguinte"><ChevronRight /></button>
      </nav></>}
    </section>}
  </AppShell></ModuleGuard></AuthGuard>;
}
