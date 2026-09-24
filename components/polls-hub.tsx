"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlignLeft,
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  Edit3,
  Eye,
  Lock,
  MessageSquareText,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Vote,
  X,
  Pencil,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FilterBar, FilterSearch, FilterSegmented } from "@/components/filter-bar";
import { CancelButton, FormActions, FormCloseButton, SubmitButton } from "@/components/form-actions";
import { SurfaceHeader } from "@/components/surface-header";
import { AppToast, ToastKind } from "@/components/app-toast";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { AuthGuard } from "@/components/auth-guard";
import { FormLabel } from "@/components/form-label";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import { Pagination, clampPage } from "@/components/pagination";
import { RecordSkeleton, recordHref, useHashRecord } from "@/components/record-list";
import { useFloatingAction } from "@/components/floating-actions";
import styles from "@/components/polls-hub.module.css";
import list from "@/components/record-list.module.css";

const FLOATING_CREATE_ICON = <Pencil aria-hidden="true" />;
const FLOATING_EDIT_ICON = <Edit3 aria-hidden="true" />;
const FLOATING_CLOSE_ICON = <Lock aria-hidden="true" />;
const FLOATING_REOPEN_ICON = <RotateCcw aria-hidden="true" />;
const FLOATING_DELETE_ICON = <Trash2 aria-hidden="true" />;
const PAGE_SIZE = 8;

type ApiOption = { id: string | number; label?: string; text?: string; votes?: number; voteCount?: number; vote_count?: number };
type ApiQuestion = { id: string | number; prompt?: string; selectionType?: string; options?: ApiOption[] };
type ApiPoll = {
  id: string | number;
  title: string;
  description?: string;
  status?: string;
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
  voted?: boolean;
  options?: ApiOption[];
  questions?: ApiQuestion[];
};
type Option = { id: string; label: string; votes: number };
/** A question without a server id is the legacy single question: votes go as plain optionIds. */
type Question = { id: string | null; prompt: string; multiple: boolean; options: Option[] };
type PollStatus = "active" | "closed";
type Poll = {
  id: string;
  title: string;
  description: string;
  status: PollStatus;
  resultsVisibility: "always" | "after_vote" | "after_close" | "cc";
  endsAt: string | null;
  totalVotes: number;
  resultsVisible: boolean;
  hasVoted: boolean;
  questions: Question[];
};
type PollForm = {
  title: string;
  description: string;
  options: string[];
  allowMultiple: boolean;
  endsAt: string;
  resultsVisibility: Poll["resultsVisibility"];
};
type Notice = { kind: ToastKind; message: string } | null;
type Filter = "all" | PollStatus;

const emptyForm = (): PollForm => ({ title: "", description: "", options: ["", ""], allowMultiple: false, endsAt: "", resultsVisibility: "after_vote" });

function isoDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function normalizeOptions(options: ApiOption[] | undefined, optionFallback: string): Option[] {
  return (options ?? []).map((option) => ({ id: String(option.id), label: option.label ?? option.text ?? optionFallback, votes: Number(option.votes ?? option.voteCount ?? option.vote_count ?? 0) }));
}

function normalize(item: ApiPoll, optionFallback: string): Poll {
  const totalVotes = item.totalVotes ?? item.total_votes;
  const questions: Question[] = item.questions?.length
    ? item.questions.map((question) => ({ id: String(question.id), prompt: question.prompt ?? item.title, multiple: question.selectionType === "multiple", options: normalizeOptions(question.options, optionFallback) }))
    : [{ id: null, prompt: item.title, multiple: item.allowMultiple ?? item.allow_multiple ?? false, options: normalizeOptions(item.options, optionFallback) }];
  return {
    id: String(item.id),
    title: item.title,
    description: item.description ?? "",
    status: item.status === "active" || item.status === "published" ? "active" : "closed",
    resultsVisibility: item.resultsVisibility ?? "after_vote",
    endsAt: isoDate(item.endsAt ?? item.ends_at),
    totalVotes: Number(totalVotes ?? 0),
    resultsVisible: totalVotes !== undefined && totalVotes !== null,
    hasVoted: item.hasVoted ?? item.has_voted ?? item.voted ?? false,
    questions,
  };
}

function localDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
}

const choiceKey = (poll: Poll, question: Question, index: number) => `${poll.id}:${question.id ?? index}`;

export function PollsHub() {
  const { locale, t } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";
  const statusLabels = useMemo<Record<PollStatus, string>>(() => ({ active: t("polls.status.active"), closed: t("polls.status.closed") }), [t]);
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
  const [closeTarget, setCloseTarget] = useState<Poll | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openId, openPoll] = useHashRecord("inquerito");

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
    closed: polls.filter((poll) => poll.status === "closed").length,
  }), [polls]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(dateLocale);
    return polls.filter((poll) => (filter === "all" || poll.status === filter) && (!term || `${poll.title} ${poll.description}`.toLocaleLowerCase(dateLocale).includes(term)));
  }, [dateLocale, filter, polls, query]);
  const currentPage = clampPage(page, visible.length, PAGE_SIZE);
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const editingPoll = editingId ? polls.find((poll) => poll.id === editingId) ?? null : null;
  const optionsLocked = Boolean(editor === "edit" && editingPoll && (editingPoll.totalVotes > 0 || editingPoll.hasVoted || editingPoll.questions.length > 1));

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
      options: poll.questions[0]?.options.map((option) => option.label) ?? ["", ""],
      allowMultiple: poll.questions[0]?.multiple ?? false,
      endsAt: inputDate(poll.endsAt),
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

  const choose = (key: string, multiple: boolean, optionId: string) => setChoices((current) => {
    const values = current[key] ?? [];
    return { ...current, [key]: multiple ? values.includes(optionId) ? values.filter((id) => id !== optionId) : [...values, optionId] : [optionId] };
  });

  async function vote(poll: Poll) {
    const answers = poll.questions.map((question, index) => ({ question, optionIds: choices[choiceKey(poll, question, index)] ?? [] }));
    if (answers.some((answer) => !answer.optionIds.length)) {
      setNotice({ kind: "warning", message: t("polls.vote.select") });
      return;
    }
    const legacy = answers.length === 1 && answers[0].question.id === null;
    const body = legacy ? { optionIds: answers[0].optionIds } : { answers: answers.map((answer) => ({ questionId: answer.question.id, optionIds: answer.optionIds })) };
    setVotingId(poll.id);
    try {
      const response = await fetch(`/api/polls/${encodeURIComponent(poll.id)}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
    if (!form.title.trim() || (!optionsLocked && cleanOptions.length < 2)) {
      setNotice({ kind: "warning", message: t("polls.validation.minimum") });
      return;
    }
    if (!optionsLocked && new Set(cleanOptions.map((option) => option.toLocaleLowerCase(dateLocale))).size !== cleanOptions.length) {
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
        if (!optionsLocked) {
          payload.options = cleanOptions;
          payload.allowMultiple = form.allowMultiple;
        }
      } else {
        payload.options = cleanOptions;
        payload.anonymous = true;
        payload.allowMultiple = form.allowMultiple;
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

  async function setPollStatus(poll: Poll, status: "published" | "closed") {
    setStatusBusy(true);
    try {
      const response = await fetch("/api/polls", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: poll.id, status }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("polls.save.updateError"));
      setCloseTarget(null);
      setNotice({ kind: "success", message: t(status === "closed" ? "polls.closedNotice" : "polls.reopenedNotice") });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("polls.save.updateError") });
    } finally {
      setStatusBusy(false);
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
      if (openId === deleteTarget.id) openPoll(null);
      setDeleteTarget(null);
      setNotice({ kind: "success", message: t("polls.delete.success") });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("polls.delete.error") });
    } finally {
      setDeleting(false);
    }
  }

  const openPollItem = openId ? polls.find((poll) => poll.id === openId) ?? null : null;
  const pollMeta = (poll: Poll) => [
    poll.resultsVisible ? `${poll.totalVotes} ${t(poll.totalVotes === 1 ? "polls.participation.one" : "polls.participation.many")}` : "",
    poll.status === "active" ? poll.endsAt ? t("polls.ends", { date: localDate(poll.endsAt, dateLocale) }) : t("polls.noEnd") : "",
    poll.hasVoted ? t("polls.youVoted") : "",
  ].filter(Boolean).join(" · ");

  useFloatingAction(canManage && !editor && !openId ? { id: "new-poll", label: t("polls.new"), icon: FLOATING_CREATE_ICON, onClick: openCreate } : null);
  const managedPoll = canManage && !editor && openPollItem ? openPollItem : null;
  useFloatingAction(managedPoll ? { id: "edit-poll", label: t("polls.edit"), icon: FLOATING_EDIT_ICON, onClick: () => openEdit(managedPoll) } : null);
  useFloatingAction(managedPoll && !statusBusy ? managedPoll.status === "active"
    ? { id: "close-poll", label: t("polls.close"), icon: FLOATING_CLOSE_ICON, onClick: () => setCloseTarget(managedPoll) }
    : { id: "reopen-poll", label: t("polls.reopen"), icon: FLOATING_REOPEN_ICON, onClick: () => void setPollStatus(managedPoll, "published") } : null);
  useFloatingAction(managedPoll ? { id: "delete-poll", label: t("polls.delete"), icon: FLOATING_DELETE_ICON, onClick: () => setDeleteTarget(managedPoll) } : null);

  /** Options of one question: inputs while the user can vote, result bars once results are visible. */
  const renderQuestion = (poll: Poll, question: Question, index: number, compact: boolean) => {
    const key = choiceKey(poll, question, index);
    const selected = choices[key] ?? [];
    const canVote = poll.status === "active" && !poll.hasVoted;
    if (!canVote && !poll.resultsVisible) return null;
    const total = poll.totalVotes || question.options.reduce((sum, option) => sum + option.votes, 0);
    if (!canVote) return <ul className={`${styles.results} ${compact ? styles.resultsCompact : ""}`} aria-label={question.prompt}>
      {question.options.map((option) => {
        const percent = total ? Math.min(100, Math.round(option.votes / total * 100)) : 0;
        const chosen = selected.includes(option.id);
        return <li className={styles.result} key={option.id} data-chosen={chosen || undefined}>
          <span className={styles.resultLabel}>{chosen && <Check aria-label={t("polls.youVoted")} />}<span>{option.label}</span></span>
          <span className={styles.resultValue}>{percent}%<small> · {option.votes}</small></span>
          <span className={styles.resultTrack} aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
        </li>;
      })}
    </ul>;
    return <div className={compact ? styles.inlineOptions : styles.optionList} role={question.multiple ? "group" : "radiogroup"} aria-label={question.prompt}>
      {question.options.map((option) => {
        const checked = selected.includes(option.id);
        return <label className={`${compact ? styles.inlineChoice : styles.voteOption} ${checked ? styles.selected : ""}`} key={option.id}>
          <input type={question.multiple ? "checkbox" : "radio"} name={`poll-${key}${compact ? "-row" : ""}`} checked={checked} onChange={() => choose(key, question.multiple, option.id)} disabled={votingId === poll.id} />
          <span className={styles.choiceMark}>{checked ? <Check /> : null}</span>
          <span className={styles.optionLabel}>{option.label}</span>
        </label>;
      })}
    </div>;
  };

  return (
    <AuthGuard>
      <ModuleGuard moduleKey="polls.voting">
        <AppShell active="polls" breadcrumb={t("polls.breadcrumb")}>
          <main className={styles.page}>
            <SurfaceHeader standalone headingLevel="h1" icon={<Vote />} eyebrow={t("polls.eyebrow")} title={t("polls.breadcrumb")} />

            {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

            {editor && (
              <section className={styles.editor} aria-labelledby="poll-editor-title">
                <SurfaceHeader
                  icon={<Vote />}
                  eyebrow={editor === "edit" ? t("polls.editor.management") : t("polls.editor.new")}
                  title={editor === "edit" ? t("polls.editor.edit") : t("polls.editor.create")}
                  headingId="poll-editor-title"
                  actions={<FormCloseButton onClick={closeEditor} label={t("polls.editor.close")} disabled={submitting} />}
                />
                <form className={styles.editorBody} onSubmit={save}>
                  <div className={styles.editorMain}>
                    <label className={styles.field}><FormLabel icon={MessageSquareText}>{t("polls.editor.question")}</FormLabel><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={180} required placeholder={t("polls.editor.questionPlaceholder")} /></label>
                    <label className={styles.field}><FormLabel icon={AlignLeft} optional>{t("polls.editor.context")}</FormLabel><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={3000} placeholder={t("polls.editor.contextPlaceholder")} /></label>
                    <div className={styles.optionsHeading}>
                      <div><strong>{t("polls.editor.options")}</strong>{optionsLocked && <small>{t("polls.editor.optionsLocked")}</small>}</div>
                      {!optionsLocked && <button className={styles.textButton} type="button" onClick={() => setForm((current) => ({ ...current, options: [...current.options, ""] }))} disabled={form.options.length >= 20}><Plus /> {t("polls.editor.add")}</button>}
                    </div>
                    <div className={styles.optionEditor}>
                      {form.options.map((value, index) => (
                        <div className={styles.optionInput} key={index}><span>{index + 1}</span><input value={value} disabled={optionsLocked} onChange={(event) => setForm((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} maxLength={180} required={index < 2 && !optionsLocked} placeholder={t("polls.editor.option", { number: index + 1 })} />{!optionsLocked && form.options.length > 2 && <button type="button" onClick={() => setForm((current) => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={t("polls.editor.removeOption", { number: index + 1 })}><X /></button>}</div>
                      ))}
                    </div>
                  </div>
                  <aside className={styles.editorAside}>
                    <label className={styles.field}><FormLabel icon={CalendarClock} optional>{t("polls.editor.endsAt")}</FormLabel><input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} /></label>
                    <label className={styles.field}><FormLabel icon={Eye}>{t("polls.editor.results")}</FormLabel><select value={form.resultsVisibility} onChange={(event) => setForm((current) => ({ ...current, resultsVisibility: event.target.value as Poll["resultsVisibility"] }))}><option value="after_vote">{t("polls.editor.afterVote")}</option><option value="always">{t("polls.editor.always")}</option><option value="after_close">{t("polls.editor.afterClose")}</option><option value="cc">{t("polls.editor.onlyCommittee")}</option></select></label>
                    <div className={styles.privacyCard}><ShieldCheck /><div><strong>{t("polls.editor.anonymous")}</strong></div></div>
                    <label className={`${styles.toggleCard} ${optionsLocked ? styles.disabled : ""}`}><input type="checkbox" checked={form.allowMultiple} disabled={optionsLocked} onChange={(event) => setForm((current) => ({ ...current, allowMultiple: event.target.checked }))} /><span><strong>{t("polls.editor.multiple")}</strong></span></label>
                  </aside>
                  <FormActions><CancelButton onClick={closeEditor} disabled={submitting}>{t("polls.editor.cancel")}</CancelButton><SubmitButton busy={submitting}>{submitting ? t("polls.editor.saving") : editor === "edit" ? t("polls.editor.save") : t("polls.editor.publish")}</SubmitButton></FormActions>
                </form>
              </section>
            )}

            {!editor && !openId && <section className={`panel ${list.listPanel}`} aria-busy={loading}>
              <FilterBar label={t("polls.filters.aria")}>
                <FilterSearch label={t("filters.search")} value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder={t("polls.filters.search")} />
                <FilterSegmented label={t("polls.filters.state")} value={filter} onChange={(value) => { setFilter(value); setPage(1); }} options={(["all", "active", "closed"] as Filter[]).map((value) => ({ value, label: value === "all" ? t("polls.filters.all") : value === "active" ? t("polls.status.active") : t("polls.filters.closed"), count: counts[value] }))} />
              </FilterBar>
              {loading ? <RecordSkeleton label={t("polls.loading")} /> : visible.length === 0 ? <div className={list.empty}><BarChart3 /><strong>{t("polls.empty.title")}</strong></div> : <ul className={list.rows}>
                {pageItems.map((poll) => {
                  const single = poll.questions.length === 1;
                  const canVote = poll.status === "active" && !poll.hasVoted;
                  return <li className={`${list.row} ${styles.pollRow}`} key={poll.id} data-tone={poll.status === "active" ? "success" : undefined}>
                    <span className={list.statusDot} aria-hidden="true" />
                    <div className={list.rowMain}>
                      <h3><a className={`link-quiet ${list.titleLink}`} href={recordHref("inquerito", poll.id)} onClick={(event) => { event.preventDefault(); openPoll(poll.id); }}>{poll.title}</a></h3>
                      {pollMeta(poll) && <p className={list.rowMeta}>{pollMeta(poll)}</p>}
                      {single && (canVote || poll.resultsVisible) && <div className={styles.inlineArea}>
                        {renderQuestion(poll, poll.questions[0], 0, true)}
                        {canVote && <button className={`button button--primary button--compact ${styles.inlineVote}`} type="button" onClick={() => void vote(poll)} disabled={votingId === poll.id || !(choices[choiceKey(poll, poll.questions[0], 0)]?.length)}>{votingId === poll.id ? t("polls.vote.submitting") : t("polls.vote.compact")}</button>}
                      </div>}
                    </div>
                    <span className={list.statusPill} data-tone={poll.status === "active" ? "success" : undefined}>{statusLabels[poll.status]}</span>
                  </li>;
                })}
              </ul>}
              {!loading && <Pagination page={currentPage} totalItems={visible.length} pageSize={PAGE_SIZE} onChange={setPage} />}
            </section>}

            {!editor && openId && <>
              <button className={list.back} type="button" onClick={() => openPoll(null)}><ChevronLeft aria-hidden="true" />{t("polls.list.title")}</button>
              <article className={`panel ${list.reading}`} aria-busy={loading}>
                {loading ? <RecordSkeleton label={t("polls.loading")} rows={2} /> : !openPollItem ? <div className={list.empty}><BarChart3 /><strong>{t("polls.empty.title")}</strong></div> : <>
                  <header className={list.byline}>
                    <span className={list.iconChip} aria-hidden="true"><Vote /></span>
                    <div>
                      <p className={list.bylineName}>{t("polls.anonymousVote")}{openPollItem.questions.length === 1 && openPollItem.questions[0].multiple && ` · ${t("polls.multipleChoice")}`}</p>
                      {pollMeta(openPollItem) && <p className={list.bylineMeta}>{pollMeta(openPollItem)}</p>}
                    </div>
                    <span className={list.statusPill} data-tone={openPollItem.status === "active" ? "success" : undefined}>{statusLabels[openPollItem.status]}</span>
                  </header>
                  <h2 className={list.readingTitle}>{openPollItem.title}</h2>
                  <span className={list.readingRule} aria-hidden="true" />
                  {openPollItem.description && <p className={list.readingBody}>{openPollItem.description}</p>}
                  {openPollItem.questions.map((question, index) => {
                    const options = renderQuestion(openPollItem, question, index, false);
                    if (!options) return null;
                    const showPrompt = openPollItem.questions.length > 1 || question.prompt !== openPollItem.title;
                    return <section className={list.readingSection} key={question.id ?? index}>
                      {showPrompt && <h3>{question.prompt}{question.multiple && openPollItem.questions.length > 1 && <small className={styles.questionHint}> · {t("polls.multipleChoice")}</small>}</h3>}
                      {options}
                    </section>;
                  })}
                  {openPollItem.status === "active" && !openPollItem.hasVoted ? <footer className={list.manageArea}>
                    <button className={`button button--primary button--compact ${styles.voteSubmit}`} type="button" onClick={() => void vote(openPollItem)} disabled={votingId === openPollItem.id}><Vote aria-hidden="true" />{votingId === openPollItem.id ? t("polls.vote.submitting") : t("polls.vote.submit")}</button>
                  </footer> : openPollItem.hasVoted ? <p className={styles.voted}><CheckCircle2 aria-hidden="true" /> {t("polls.voted")}</p> : null}
                </>}
              </article>
            </>}

            <ConfirmationDialog
              open={Boolean(closeTarget)}
              eyebrow=""
              title={t("polls.closeConfirm.title")}
              description=""
              subject={closeTarget?.title}
              subjectLabel={t("polls.breadcrumb")}
              confirmLabel={t("polls.closeConfirm.confirm")}
              cancelLabel={t("polls.delete.cancel")}
              tone="primary"
              icon={<Lock />}
              busy={statusBusy}
              onClose={() => setCloseTarget(null)}
              onConfirm={() => { if (closeTarget) void setPollStatus(closeTarget, "closed"); }}
            />
            <ConfirmationDialog
              open={Boolean(deleteTarget)}
              eyebrow={t("polls.delete.eyebrow")}
              title={deleteTarget ? t("polls.delete.title", { title: deleteTarget.title }) : ""}
              description={t("polls.delete.intro")}
              confirmLabel={t(deleting ? "polls.delete.deleting" : "polls.delete.confirm")}
              cancelLabel={t("polls.delete.cancel")}
              busy={deleting}
              onClose={() => setDeleteTarget(null)}
              onConfirm={() => void deletePoll()}
            />
          </main>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
