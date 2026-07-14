"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlignLeft,
  BarChart3,
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  Edit3,
  Eye,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Vote,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { FormLabel } from "@/components/form-label";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import styles from "@/components/polls-hub.module.css";

type ApiOption = { id: string | number; label?: string; text?: string; votes?: number; voteCount?: number; vote_count?: number };
type ApiPoll = {
  id: string | number;
  title: string;
  description?: string;
  status?: "draft" | "active" | "published" | "closed" | "archived";
  anonymous?: boolean;
  allowMultiple?: boolean;
  allow_multiple?: boolean;
  resultsVisibility?: Poll["resultsVisibility"];
  startsAt?: string | number | null;
  starts_at?: string | number | null;
  endsAt?: string | number | null;
  ends_at?: string | number | null;
  totalVotes?: number;
  total_votes?: number;
  hasVoted?: boolean;
  has_voted?: boolean;
  selectedOptionIds?: Array<string | number>;
  selected_option_ids?: Array<string | number>;
  options?: ApiOption[];
};
type Poll = {
  id: string;
  title: string;
  description: string;
  status: "draft" | "active" | "closed" | "archived";
  anonymous: boolean;
  allowMultiple: boolean;
  resultsVisibility: "always" | "after_vote" | "after_close" | "cc";
  startsAt: string | null;
  endsAt: string | null;
  totalVotes: number;
  hasVoted: boolean;
  selectedOptionIds: string[];
  options: Array<{ id: string; label: string; votes: number }>;
};
type PollForm = {
  title: string;
  description: string;
  options: string[];
  allowMultiple: boolean;
  endsAt: string;
  status: "draft" | "published" | "closed" | "archived";
  resultsVisibility: Poll["resultsVisibility"];
};
type Notice = { kind: ToastKind; message: string } | null;
type Filter = "all" | Poll["status"];

const emptyForm = (): PollForm => ({
  title: "",
  description: "",
  options: ["", ""],
  allowMultiple: false,
  endsAt: "",
  status: "published",
  resultsVisibility: "after_vote",
});

function isoDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(typeof value === "number" ? value : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function normalize(item: ApiPoll, optionFallback: string): Poll {
  const status = item.status === "published" ? "active" : item.status ?? "active";
  return {
    id: String(item.id),
    title: item.title,
    description: item.description ?? "",
    status,
    anonymous: item.anonymous !== false,
    allowMultiple: item.allowMultiple ?? item.allow_multiple ?? false,
    resultsVisibility: item.resultsVisibility ?? "after_vote",
    startsAt: isoDate(item.startsAt ?? item.starts_at),
    endsAt: isoDate(item.endsAt ?? item.ends_at),
    totalVotes: Number(item.totalVotes ?? item.total_votes ?? 0),
    hasVoted: item.hasVoted ?? item.has_voted ?? false,
    selectedOptionIds: (item.selectedOptionIds ?? item.selected_option_ids ?? []).map(String),
    options: (item.options ?? []).map((option) => ({
      id: String(option.id),
      label: option.label ?? option.text ?? optionFallback,
      votes: Number(option.votes ?? option.voteCount ?? option.vote_count ?? 0),
    })),
  };
}

function localDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
}

export function PollsHub() {
  const { locale, t } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";
  const statusLabels = useMemo<Record<Poll["status"], string>>(() => ({
    active: t("polls.status.active"),
    draft: t("polls.status.draft"),
    closed: t("polls.status.closed"),
    archived: t("polls.status.archived"),
  }), [t]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [editor, setEditor] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PollForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Poll | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/polls?scope=management", { cache: "no-store" });
      const data = (await response.json()) as { polls?: ApiPoll[]; canCreate?: boolean; canManage?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || t("polls.loadError"));
      setPolls((data.polls ?? []).map((poll) => normalize(poll, t("polls.optionFallback"))));
      setCanManage(data.canManage ?? data.canCreate ?? false);
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("polls.loadError") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: polls.length,
    active: polls.filter((poll) => poll.status === "active").length,
    draft: polls.filter((poll) => poll.status === "draft").length,
    closed: polls.filter((poll) => poll.status === "closed").length,
    archived: polls.filter((poll) => poll.status === "archived").length,
  }), [polls]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(dateLocale);
    return polls.filter((poll) => (filter === "all" || poll.status === filter) && (!term || `${poll.title} ${poll.description}`.toLocaleLowerCase(dateLocale).includes(term)));
  }, [dateLocale, filter, polls, query]);

  const editingPoll = editingId ? polls.find((poll) => poll.id === editingId) ?? null : null;
  const optionsLocked = Boolean(editor === "edit" && editingPoll && editingPoll.totalVotes > 0);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setEditor("create");
  }

  function openEdit(poll: Poll) {
    setEditingId(poll.id);
    setForm({
      title: poll.title,
      description: poll.description,
      options: poll.options.map((option) => option.label),
      allowMultiple: poll.allowMultiple,
      endsAt: inputDate(poll.endsAt),
      status: poll.status === "active" ? "published" : poll.status,
      resultsVisibility: poll.resultsVisibility,
    });
    setEditor("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeEditor() {
    setEditor(null);
    setEditingId(null);
    setForm(emptyForm());
  }

  const choose = (poll: Poll, optionId: string) => setChoices((current) => {
    const values = current[poll.id] ?? [];
    return { ...current, [poll.id]: poll.allowMultiple ? values.includes(optionId) ? values.filter((id) => id !== optionId) : [...values, optionId] : [optionId] };
  });

  async function vote(poll: Poll) {
    const optionIds = choices[poll.id] ?? [];
    if (!optionIds.length) {
      setNotice({ kind: "warning", message: t("polls.vote.select") });
      return;
    }
    setVotingId(poll.id);
    try {
      const response = await fetch(`/api/polls/${encodeURIComponent(poll.id)}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ optionIds }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("polls.vote.error"));
      setNotice({ kind: "success", message: t("polls.vote.success") });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("polls.vote.error") });
    } finally {
      setVotingId(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const cleanOptions = form.options.map((value) => value.trim()).filter(Boolean);
    if (!form.title.trim() || cleanOptions.length < 2) {
      setNotice({ kind: "warning", message: t("polls.validation.minimum") });
      return;
    }
    if (new Set(cleanOptions.map((option) => option.toLocaleLowerCase(dateLocale))).size !== cleanOptions.length) {
      setNotice({ kind: "warning", message: t("polls.validation.duplicate") });
      return;
    }
    setSubmitting(true);
    try {
      const editing = editor === "edit" && editingId;
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        resultsVisibility: form.resultsVisibility,
      };
      if (editing) {
        payload.id = editingId;
        payload.status = form.status;
        if (!optionsLocked) {
          payload.options = cleanOptions;
          payload.allowMultiple = form.allowMultiple;
        }
      } else {
        payload.options = cleanOptions;
        payload.anonymous = true;
        payload.allowMultiple = form.allowMultiple;
        payload.resultsVisibility = form.resultsVisibility;
      }
      const response = await fetch("/api/polls", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || t(editing ? "polls.save.updateError" : "polls.save.createError"));
      closeEditor();
      setNotice({ kind: "success", message: t(editing ? "polls.save.updated" : "polls.save.published") });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("polls.save.error") });
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePoll() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/polls", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: deleteTarget.id }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("polls.delete.error"));
      if (editingId === deleteTarget.id) closeEditor();
      setDeleteTarget(null);
      setNotice({ kind: "success", message: t("polls.delete.success") });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("polls.delete.error") });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AuthGuard>
      <ModuleGuard moduleKey="polls.voting">
        <AppShell active="polls" breadcrumb={t("polls.breadcrumb")}>
          <main className={styles.page}>
            <section className={styles.hero}>
              <div className={styles.heroContent}>
                <span className={styles.heroIcon}><Vote /></span>
                <div>
                  <span className={styles.eyebrow}>{t("polls.eyebrow")}</span>
                  <h1>{t("polls.title")}</h1>
                  <p>{t("polls.intro")}</p>
                </div>
              </div>
              <div className={styles.heroActions}>
                <div className={styles.heroStats}>
                  <span><strong>{counts.active}</strong> {t("polls.stats.ongoing")}</span>
                  <span><strong>{polls.reduce((sum, poll) => sum + poll.totalVotes, 0)}</strong> {t("polls.stats.participations")}</span>
                </div>
                {canManage && <button className={styles.createButton} type="button" onClick={openCreate}><Plus /> {t("polls.new")}</button>}
              </div>
            </section>

            {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

            {editor && (
              <section className={styles.editor} aria-labelledby="poll-editor-title">
                <header className={styles.editorHeader}>
                  <div>
                    <span className={styles.eyebrow}>{editor === "edit" ? t("polls.editor.management") : t("polls.editor.new")}</span>
                    <h2 id="poll-editor-title">{editor === "edit" ? t("polls.editor.edit") : t("polls.editor.create")}</h2>
                    <p>{optionsLocked ? t("polls.editor.lockedIntro") : t("polls.editor.intro")}</p>
                  </div>
                  <button className={styles.closeButton} type="button" onClick={closeEditor} aria-label={t("polls.editor.close")}><X /></button>
                </header>
                <form className={styles.editorBody} onSubmit={save}>
                  <div className={styles.editorMain}>
                    <label className={styles.field}><FormLabel icon={MessageSquareText}>{t("polls.editor.question")}</FormLabel><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={180} required placeholder={t("polls.editor.questionPlaceholder")} /></label>
                    <label className={styles.field}><FormLabel icon={AlignLeft} optional>{t("polls.editor.context")}</FormLabel><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={3000} placeholder={t("polls.editor.contextPlaceholder")} /></label>
                    <div className={styles.optionsHeading}>
                      <div><strong>{t("polls.editor.options")}</strong><small>{optionsLocked ? t("polls.editor.optionsLocked") : t("polls.editor.optionsHelp")}</small></div>
                      {!optionsLocked && <button className={styles.textButton} type="button" onClick={() => setForm((current) => ({ ...current, options: [...current.options, ""] }))} disabled={form.options.length >= 20}><Plus /> {t("polls.editor.add")}</button>}
                    </div>
                    <div className={styles.optionEditor}>
                      {form.options.map((value, index) => (
                        <div className={styles.optionInput} key={index}><span>{index + 1}</span><input value={value} disabled={optionsLocked} onChange={(event) => setForm((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} maxLength={180} required={index < 2} placeholder={t("polls.editor.option", { number: index + 1 })} />{!optionsLocked && form.options.length > 2 && <button type="button" onClick={() => setForm((current) => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={t("polls.editor.removeOption", { number: index + 1 })}><X /></button>}</div>
                      ))}
                    </div>
                  </div>
                  <aside className={styles.editorAside}>
                    {editor === "edit" && <label className={styles.field}><FormLabel icon={CircleDot}>{t("polls.editor.status")}</FormLabel><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PollForm["status"] }))}><option value="draft">{t("polls.status.draft")}</option><option value="published">{t("polls.editor.statusPublished")}</option><option value="closed">{t("polls.status.closed")}</option><option value="archived">{t("polls.status.archived")}</option></select></label>}
                    <label className={styles.field}><FormLabel icon={CalendarClock} optional>{t("polls.editor.endsAt")}</FormLabel><input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} /></label>
                    <label className={styles.field}><FormLabel icon={Eye}>{t("polls.editor.results")}</FormLabel><select value={form.resultsVisibility} onChange={(event) => setForm((current) => ({ ...current, resultsVisibility: event.target.value as Poll["resultsVisibility"] }))}><option value="after_vote">{t("polls.editor.afterVote")}</option><option value="always">{t("polls.editor.always")}</option><option value="after_close">{t("polls.editor.afterClose")}</option><option value="cc">{t("polls.editor.onlyCommittee")}</option></select></label>
                    <div className={styles.privacyCard}><ShieldCheck /><div><strong>{t("polls.editor.anonymous")}</strong><small>{t("polls.editor.anonymousHelp")}</small></div></div>
                    <label className={`${styles.toggleCard} ${optionsLocked ? styles.disabled : ""}`}><input type="checkbox" checked={form.allowMultiple} disabled={optionsLocked} onChange={(event) => setForm((current) => ({ ...current, allowMultiple: event.target.checked }))} /><span><strong>{t("polls.editor.multiple")}</strong><small>{t("polls.editor.multipleHelp")}</small></span></label>
                    <div className={styles.editorActions}><button className={styles.secondaryButton} type="button" onClick={closeEditor}>{t("polls.editor.cancel")}</button><button className={styles.primaryButton} type="submit" disabled={submitting}>{submitting ? <LoaderCircle className={styles.spin} /> : <Send />}{submitting ? t("polls.editor.saving") : editor === "edit" ? t("polls.editor.save") : t("polls.editor.publish")}</button></div>
                  </aside>
                </form>
              </section>
            )}

            <section className={styles.workspace}>
              <header className={styles.toolbar}>
                <div className={styles.tabs} role="tablist" aria-label={t("polls.filters.aria")}>
                  {(["all", "active", ...(canManage ? ["draft", "closed", "archived"] : ["closed"]) ] as Filter[]).map((value) => <button key={value} type="button" className={filter === value ? styles.activeTab : ""} onClick={() => setFilter(value)}>{value === "all" ? t("polls.filters.all") : statusLabels[value]}<span>{counts[value]}</span></button>)}
                </div>
                <label className={styles.search}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("polls.filters.search")} /></label>
              </header>

              {loading ? <div className={styles.empty}><LoaderCircle className={styles.spin} /><strong>{t("polls.loading")}</strong></div> : visible.length === 0 ? <div className={styles.empty}><BarChart3 /><strong>{t("polls.empty.title")}</strong><p>{t("polls.empty.body")}</p></div> : <div className={styles.pollList}>
                {visible.map((poll) => {
                  const selected = choices[poll.id] ?? poll.selectedOptionIds;
                  const showResults = poll.hasVoted || poll.status === "closed" || canManage;
                  return <article className={styles.pollCard} key={poll.id}>
                    <header className={styles.pollHeader}>
                      <div className={styles.pollTitleBlock}>
                        <div className={styles.statusLine}><span className={`${styles.status} ${styles[`status_${poll.status}`]}`}><CircleDot />{statusLabels[poll.status]}</span><span className={styles.anonymous}><LockKeyhole /> {t("polls.anonymousVote")}</span>{poll.allowMultiple && <span className={styles.multiple}>{t("polls.multipleChoice")}</span>}</div>
                        <h2>{poll.title}</h2>
                        {poll.description && <p>{poll.description}</p>}
                      </div>
                      {canManage && <div className={styles.pollActions}><button className={styles.editButton} type="button" onClick={() => openEdit(poll)}><Edit3 /> {t("polls.edit")}</button><button className={styles.deleteButton} type="button" onClick={() => setDeleteTarget(poll)}><Trash2 /> {t("polls.delete")}</button></div>}
                    </header>
                    <div className={styles.optionList}>
                      {poll.options.map((option) => {
                        const percent = poll.totalVotes ? Math.round(option.votes / poll.totalVotes * 100) : 0;
                        const checked = selected.includes(option.id);
                        return <label className={`${styles.voteOption} ${checked ? styles.selected : ""}`} key={option.id}>
                          {showResults && <span className={styles.resultBar} style={{ width: `${Math.min(percent, 100)}%` }} />}
                          <input type={poll.allowMultiple ? "checkbox" : "radio"} name={`poll-${poll.id}`} checked={checked} onChange={() => choose(poll, option.id)} disabled={poll.status !== "active" || poll.hasVoted} />
                          <span className={styles.choiceMark}>{checked ? <Check /> : null}</span>
                          <span className={styles.optionLabel}>{option.label}</span>
                          {showResults && <strong>{percent}%</strong>}
                        </label>;
                      })}
                    </div>
                    <footer className={styles.pollFooter}>
                      <div className={styles.pollMeta}><span><Users /> {poll.totalVotes} {t(poll.totalVotes === 1 ? "polls.participation.one" : "polls.participation.many")}</span><span>{poll.endsAt ? <><CalendarClock /> {t("polls.ends", { date: localDate(poll.endsAt, dateLocale) })}</> : <><Clock3 /> {t("polls.noEnd")}</>}</span>{poll.hasVoted && <span className={styles.voted}><CheckCircle2 /> {t("polls.voted")}</span>}</div>
                      {poll.status === "active" && !poll.hasVoted && <button className={styles.voteButton} type="button" onClick={() => void vote(poll)} disabled={votingId === poll.id}>{votingId === poll.id ? <LoaderCircle className={styles.spin} /> : <Vote />}{votingId === poll.id ? t("polls.vote.submitting") : t("polls.vote.submit")}</button>}
                    </footer>
                  </article>;
                })}
              </div>}
            </section>

            {deleteTarget && <div className={styles.confirmBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !deleting) setDeleteTarget(null); }}><section className={styles.confirmDialog} role="dialog" aria-modal="true" aria-labelledby="delete-poll-title"><span className={styles.confirmIcon}><AlertTriangle /></span><div><span className={styles.eyebrow}>{t("polls.delete.eyebrow")}</span><h2 id="delete-poll-title">{t("polls.delete.title", { title: deleteTarget.title })}</h2><p>{t("polls.delete.intro")}</p></div><footer><button className={styles.secondaryButton} type="button" disabled={deleting} onClick={() => setDeleteTarget(null)}>{t("polls.delete.cancel")}</button><button className={styles.dangerButton} type="button" disabled={deleting} onClick={() => void deletePoll()}>{deleting ? <LoaderCircle className={styles.spin} /> : <Trash2 />}{deleting ? t("polls.delete.deleting") : t("polls.delete.confirm")}</button></footer></section></div>}
          </main>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
