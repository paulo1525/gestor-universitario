"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, LoaderCircle, Send, Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useI18n } from "@/components/i18n-context";
import { PersonName } from "@/components/person-name";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { announcementPlainText } from "@/lib/announcement-content";
import { personDisplay } from "@/lib/person-display";
import styles from "@/components/announcement-comments.module.css";

type Comment = {
  id: string;
  body: string;
  createdAt: number;
  author: { fullName: string; id?: string; email?: string; anonymous?: boolean };
  commission?: boolean;
  own: boolean;
  canDelete: boolean;
};

const DEFAULT_MAX_LENGTH = 1000;

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase();
}

/* One comment thread component for announcements and requests: the endpoint and the
   id parameter change, the anatomy stays the same. */
export function AnnouncementComments({ announcementId, revealIdentifiers, onCountChange, readOnly = false, endpoint = "/api/announcements/comments", targetParam = "announcementId", maxLength = DEFAULT_MAX_LENGTH }: { announcementId: string; revealIdentifiers: boolean; onCountChange?: (count: number) => void; readOnly?: boolean; endpoint?: string; targetParam?: string; maxLength?: number }) {
  const MAX_LENGTH = maxLength;
  const { locale, t } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);
  const [canWrite, setCanWrite] = useState(true);
  const countChange = useRef(onCountChange);
  useEffect(() => { countChange.current = onCountChange; });

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${endpoint}?${targetParam}=${encodeURIComponent(announcementId)}`, { cache: "no-store", credentials: "same-origin" });
      const data = await response.json() as { comments?: Comment[]; canWrite?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || t("announcements.comments.loadError"));
      setComments(data.comments ?? []);
      setCanWrite(data.canWrite !== false);
      countChange.current?.(data.comments?.length ?? 0);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("announcements.comments.loadError"));
    } finally {
      setLoading(false);
    }
  }, [announcementId, endpoint, t, targetParam]);

  // A função inicia I/O antes de atualizar o estado com a resposta.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!announcementPlainText(text) || sending) return;
    setSending(true);
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ [targetParam]: announcementId, body: text }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("announcements.comments.sendError"));
      setDraft("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("announcements.comments.sendError"));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await fetch(endpoint, { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("announcements.comments.sendError"));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("announcements.comments.sendError"));
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  };

  const when = (value: number) => {
    const date = new Date(value);
    const sameDay = date.toDateString() === new Date().toDateString();
    return new Intl.DateTimeFormat(dateLocale, sameDay ? { timeStyle: "short" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  };

  return (
    <section className={styles.comments} aria-labelledby={`comments-${announcementId}`}>
      <h3 id={`comments-${announcementId}`} className={styles.heading}>{t("announcements.comments.title")}{comments.length > 0 && <span>{comments.length}</span>}</h3>
      {loading ? null : comments.length === 0 ? <p className={styles.state}>{t("announcements.comments.empty")}</p> : (
        <ol className={styles.list}>
          {comments.map(comment => (
            <li key={comment.id} className={styles.comment}>
              <span className={`${styles.avatar} ${comment.own ? styles.avatarOwn : ""} ${comment.commission ? styles.avatarCommission : ""}`} aria-hidden="true">{comment.author.anonymous ? <EyeOff /> : initials(comment.author.fullName)}</span>
              <div className={styles.content}>
                <p className={styles.meta}><strong>{comment.author.anonymous ? comment.author.fullName : <PersonName person={personDisplay(comment.author, { revealIdentifier: revealIdentifiers, locale })} />}</strong>{comment.commission && <span className={styles.commissionTag}>{t("comments.commission")}</span>}<time dateTime={new Date(comment.createdAt).toISOString()}>{when(comment.createdAt)}</time></p>
                <RichTextContent className={styles.body} value={comment.body} />
              </div>
              {comment.canDelete && !readOnly && canWrite && <button className={styles.delete} type="button" onClick={() => setDeleteTarget(comment)} disabled={deletingId === comment.id} aria-label={t("announcements.comments.delete")} title={t("announcements.comments.delete")}><Trash2 aria-hidden="true" /></button>}
            </li>
          ))}
        </ol>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!readOnly && canWrite && <form className={styles.composer} onSubmit={send}>
        <RichTextEditor value={draft} onChange={setDraft} ariaLabel={t("announcements.comments.placeholder")} placeholder={t("announcements.comments.placeholder")} maxLength={MAX_LENGTH} minHeight="minimal" disabled={sending} actions={
          <button className={`button button--primary button--compact ${styles.send}`} type="submit" disabled={!announcementPlainText(draft) || announcementPlainText(draft).length > MAX_LENGTH || sending} aria-busy={sending || undefined}>
            {sending ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Send aria-hidden="true" />}{t("announcements.comments.send")}
          </button>
        } />
      </form>}
      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        eyebrow={t("announcements.comments.deleteDialog.eyebrow")}
        title={t("announcements.comments.deleteDialog.title")}
        description={t("announcements.comments.deleteDialog.description")}
        subject={deleteTarget ? announcementPlainText(deleteTarget.body).slice(0, 140) : undefined}
        subjectLabel={t("announcements.comments.deleteDialog.subject")}
        confirmLabel={t(deletingId ? "announcements.comments.deleting" : "announcements.comments.delete")}
        cancelLabel={t("common.cancel")}
        busy={Boolean(deletingId)}
        onClose={() => { if (!deletingId) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) void remove(deleteTarget.id); }}
      />
    </section>
  );
}
