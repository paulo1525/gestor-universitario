"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  Edit3,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Users,
  Vote,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
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

function normalize(item: ApiPoll): Poll {
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
      label: option.label ?? option.text ?? "Opção",
      votes: Number(option.votes ?? option.voteCount ?? option.vote_count ?? 0),
    })),
  };
}

function localDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
}

const statusLabels: Record<Poll["status"], string> = { active: "A decorrer", draft: "Rascunho", closed: "Encerrado", archived: "Arquivado" };

export function PollsHub() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [editor, setEditor] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PollForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/polls?scope=management", { cache: "no-store" });
      const data = (await response.json()) as { polls?: ApiPoll[]; canCreate?: boolean; canManage?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os inquéritos.");
      setPolls((data.polls ?? []).map(normalize));
      setCanManage(data.canManage ?? data.canCreate ?? false);
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível carregar os inquéritos." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: polls.length,
    active: polls.filter((poll) => poll.status === "active").length,
    draft: polls.filter((poll) => poll.status === "draft").length,
    closed: polls.filter((poll) => poll.status === "closed").length,
    archived: polls.filter((poll) => poll.status === "archived").length,
  }), [polls]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-PT");
    return polls.filter((poll) => (filter === "all" || poll.status === filter) && (!term || `${poll.title} ${poll.description}`.toLocaleLowerCase("pt-PT").includes(term)));
  }, [filter, polls, query]);

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
      setNotice({ kind: "warning", message: "Seleciona pelo menos uma opção antes de votar." });
      return;
    }
    setVotingId(poll.id);
    try {
      const response = await fetch(`/api/polls/${encodeURIComponent(poll.id)}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ optionIds }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível registar o voto.");
      setNotice({ kind: "success", message: "O teu voto foi registado de forma anónima." });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível registar o voto." });
    } finally {
      setVotingId(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const cleanOptions = form.options.map((value) => value.trim()).filter(Boolean);
    if (!form.title.trim() || cleanOptions.length < 2) {
      setNotice({ kind: "warning", message: "Indica um título e pelo menos duas opções." });
      return;
    }
    if (new Set(cleanOptions.map((option) => option.toLocaleLowerCase("pt-PT"))).size !== cleanOptions.length) {
      setNotice({ kind: "warning", message: "As opções de resposta não podem estar repetidas." });
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
      if (!response.ok) throw new Error(data.error || `Não foi possível ${editing ? "atualizar" : "criar"} o inquérito.`);
      closeEditor();
      setNotice({ kind: "success", message: editing ? "Inquérito atualizado." : "Inquérito publicado." });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível guardar o inquérito." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthGuard>
      <ModuleGuard moduleKey="polls.voting">
        <AppShell active="polls" breadcrumb="Inquéritos">
          <main className={styles.page}>
            <section className={styles.hero}>
              <div className={styles.heroContent}>
                <span className={styles.heroIcon}><Vote /></span>
                <div>
                  <span className={styles.eyebrow}>Participação académica</span>
                  <h1>A tua opinião conta.</h1>
                  <p>Vota nas decisões da comunidade com privacidade. A participação é validada, mas a resposta nunca fica ligada ao teu perfil.</p>
                </div>
              </div>
              <div className={styles.heroStats}>
                <span><strong>{counts.active}</strong> em curso</span>
                <span><strong>{polls.reduce((sum, poll) => sum + poll.totalVotes, 0)}</strong> participações</span>
              </div>
              {canManage && <button className={styles.primaryButton} type="button" onClick={openCreate}><Plus /> Novo inquérito</button>}
            </section>

            {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

            {editor && (
              <section className={styles.editor} aria-labelledby="poll-editor-title">
                <header className={styles.editorHeader}>
                  <div>
                    <span className={styles.eyebrow}>{editor === "edit" ? "Gestão do inquérito" : "Novo inquérito"}</span>
                    <h2 id="poll-editor-title">{editor === "edit" ? "Editar inquérito" : "Criar uma votação"}</h2>
                    <p>{optionsLocked ? "Já existem votos: a pergunta, o estado e as datas podem ser ajustados, mas as opções ficam protegidas." : "Define uma pergunta clara, as respostas disponíveis e quando termina."}</p>
                  </div>
                  <button className={styles.closeButton} type="button" onClick={closeEditor} aria-label="Fechar editor"><X /></button>
                </header>
                <form className={styles.editorBody} onSubmit={save}>
                  <div className={styles.editorMain}>
                    <label className={styles.field}><span>Pergunta</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={180} required placeholder="O que gostarias de perguntar?" /></label>
                    <label className={styles.field}><span>Contexto <small>opcional</small></span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={3000} placeholder="Explica brevemente o objetivo desta votação…" /></label>
                    <div className={styles.optionsHeading}>
                      <div><strong>Opções de resposta</strong><small>{optionsLocked ? "Protegidas porque o inquérito já recebeu votos." : "Entre 2 e 20 opções diferentes."}</small></div>
                      {!optionsLocked && <button className={styles.textButton} type="button" onClick={() => setForm((current) => ({ ...current, options: [...current.options, ""] }))} disabled={form.options.length >= 20}><Plus /> Adicionar</button>}
                    </div>
                    <div className={styles.optionEditor}>
                      {form.options.map((value, index) => (
                        <div className={styles.optionInput} key={index}><span>{index + 1}</span><input value={value} disabled={optionsLocked} onChange={(event) => setForm((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} maxLength={180} required={index < 2} placeholder={`Opção ${index + 1}`} />{!optionsLocked && form.options.length > 2 && <button type="button" onClick={() => setForm((current) => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remover opção ${index + 1}`}><X /></button>}</div>
                      ))}
                    </div>
                  </div>
                  <aside className={styles.editorAside}>
                    {editor === "edit" && <label className={styles.field}><span>Estado</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PollForm["status"] }))}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="closed">Encerrado</option><option value="archived">Arquivado</option></select></label>}
                    <label className={styles.field}><span>Termina em <small>opcional</small></span><input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} /></label>
                    <label className={styles.field}><span>Mostrar resultados</span><select value={form.resultsVisibility} onChange={(event) => setForm((current) => ({ ...current, resultsVisibility: event.target.value as Poll["resultsVisibility"] }))}><option value="after_vote">Depois de votar</option><option value="always">Sempre</option><option value="after_close">Depois de encerrar</option><option value="cc">Só à Comissão de Curso</option></select></label>
                    <div className={styles.privacyCard}><ShieldCheck /><div><strong>Votação anónima</strong><small>A identidade valida uma única participação, mas nunca é guardada junto da resposta.</small></div></div>
                    <label className={`${styles.toggleCard} ${optionsLocked ? styles.disabled : ""}`}><input type="checkbox" checked={form.allowMultiple} disabled={optionsLocked} onChange={(event) => setForm((current) => ({ ...current, allowMultiple: event.target.checked }))} /><span><strong>Escolha múltipla</strong><small>Permite selecionar várias respostas.</small></span></label>
                    <div className={styles.editorActions}><button className={styles.secondaryButton} type="button" onClick={closeEditor}>Cancelar</button><button className={styles.primaryButton} type="submit" disabled={submitting}>{submitting ? <LoaderCircle className={styles.spin} /> : <Send />}{submitting ? "A guardar…" : editor === "edit" ? "Guardar alterações" : "Publicar"}</button></div>
                  </aside>
                </form>
              </section>
            )}

            <section className={styles.workspace}>
              <header className={styles.toolbar}>
                <div className={styles.tabs} role="tablist" aria-label="Filtrar inquéritos">
                  {(["all", "active", ...(canManage ? ["draft", "closed", "archived"] : ["closed"]) ] as Filter[]).map((value) => <button key={value} type="button" className={filter === value ? styles.activeTab : ""} onClick={() => setFilter(value)}>{value === "all" ? "Todos" : statusLabels[value]}<span>{counts[value]}</span></button>)}
                </div>
                <label className={styles.search}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar inquéritos" /></label>
              </header>

              {loading ? <div className={styles.empty}><LoaderCircle className={styles.spin} /><strong>A carregar inquéritos…</strong></div> : visible.length === 0 ? <div className={styles.empty}><BarChart3 /><strong>Nenhum inquérito por aqui</strong><p>Experimenta outro filtro ou cria uma nova votação.</p></div> : <div className={styles.pollList}>
                {visible.map((poll) => {
                  const selected = choices[poll.id] ?? poll.selectedOptionIds;
                  const showResults = poll.hasVoted || poll.status === "closed" || canManage;
                  return <article className={styles.pollCard} key={poll.id}>
                    <header className={styles.pollHeader}>
                      <div className={styles.pollTitleBlock}>
                        <div className={styles.statusLine}><span className={`${styles.status} ${styles[`status_${poll.status}`]}`}><CircleDot />{statusLabels[poll.status]}</span><span className={styles.anonymous}><LockKeyhole /> Voto anónimo</span>{poll.allowMultiple && <span className={styles.multiple}>Escolha múltipla</span>}</div>
                        <h2>{poll.title}</h2>
                        {poll.description && <p>{poll.description}</p>}
                      </div>
                      {canManage && <button className={styles.editButton} type="button" onClick={() => openEdit(poll)}><Edit3 /> Editar</button>}
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
                      <div className={styles.pollMeta}><span><Users /> {poll.totalVotes} {poll.totalVotes === 1 ? "participação" : "participações"}</span><span>{poll.endsAt ? <><CalendarClock /> Termina {localDate(poll.endsAt)}</> : <><Clock3 /> Sem data de fim</>}</span>{poll.hasVoted && <span className={styles.voted}><CheckCircle2 /> Já participaste</span>}</div>
                      {poll.status === "active" && !poll.hasVoted && <button className={styles.voteButton} type="button" onClick={() => void vote(poll)} disabled={votingId === poll.id}>{votingId === poll.id ? <LoaderCircle className={styles.spin} /> : <Vote />}{votingId === poll.id ? "A registar…" : "Submeter voto"}</button>}
                    </footer>
                  </article>;
                })}
              </div>}
            </section>
          </main>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
