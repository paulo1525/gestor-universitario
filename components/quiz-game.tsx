"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Crown, Flame, Lock, LogOut, Medal, Pencil, Star, Target, Trophy, Users, Volume2, VolumeX, X, XCircle, Zap } from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RecordSkeleton } from "@/components/record-list";
import { SurfaceHeader } from "@/components/surface-header";
import { attemptXp, isRankingPass, quizLevel, XP_PER_CORRECT, type QuizGameProfile, type RankingPeriod } from "@/lib/quiz-gamification.mjs";
import { SOUND_STORAGE_KEY, readSoundEnabled, playQuizSound, stopQuizSound } from "@/lib/quiz-audio";
export { playQuizSound } from "@/lib/quiz-audio";
import styles from "@/components/quiz-game.module.css";

export type { QuizGameProfile };

export async function fetchQuizProfile(): Promise<QuizGameProfile | null> {
  try {
    const response = await fetch("/api/quiz-profile", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { profile?: QuizGameProfile };
    return data.profile ?? null;
  } catch { return null; }
}

/** Short haptic cue on phones; silently ignored elsewhere. */
export function haptic(pattern: number | number[]) {
  try { if (typeof navigator !== "undefined" && "vibrate" in navigator && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) navigator.vibrate(pattern); } catch { /* unsupported */ }
}

const SOUND_CHANGED_EVENT = "gestor-quiz-sound-change";

/** Shared on/off setting: the HUD icon and the session options stay in sync. */
export function useQuizSound(): [boolean, () => void] {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const sync = () => setEnabled(readSoundEnabled());
    sync();
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") stopQuizSound(); };
    window.addEventListener(SOUND_CHANGED_EVENT, sync);
    window.addEventListener("pagehide", stopQuizSound);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener(SOUND_CHANGED_EVENT, sync);
      window.removeEventListener("pagehide", stopQuizSound);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopQuizSound();
    };
  }, []);
  const toggle = () => {
    const next = !readSoundEnabled();
    try { window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off"); } catch { /* ignore */ }
    window.dispatchEvent(new Event(SOUND_CHANGED_EVENT));
    if (next) playQuizSound("correct");
    else stopQuizSound();
  };
  return [enabled, toggle];
}

export function SoundToggle({ className }: { className?: string }) {
  const [enabled, toggle] = useQuizSound();
  return <button type="button" className={className} aria-pressed={enabled} aria-label={enabled ? "Desligar sons" : "Ligar sons"} title={enabled ? "Desligar sons" : "Ligar sons"} onClick={toggle}>{enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}</button>;
}

export type TrackState = "empty" | "answered" | "correct" | "wrong";

/** One segment per question: the progress bar doubles as the question map. */
export function QuestionTrack({ states, current, disabled, onSelect }: { states: TrackState[]; current: number; disabled: boolean; onSelect: (index: number) => void }) {
  const labels: Record<TrackState, string> = { empty: "por responder", answered: "respondida", correct: "certa", wrong: "errada" };
  return <div className={styles.track} role="group" aria-label="Perguntas" data-dense={states.length > 20 || undefined}>
    {states.map((state, index) => <button key={index} type="button" className={styles.trackStep} data-state={state} aria-current={index === current ? "step" : undefined} aria-label={`Pergunta ${index + 1}, ${labels[state]}`} disabled={disabled} onClick={() => onSelect(index)}><span /></button>)}
  </div>;
}

export function XpCounter({ xp, burst }: { xp: number; burst: number }) {
  return <span className={styles.xp} aria-label={`${xp} XP nesta sessão`}>
    <Zap aria-hidden="true" /><b key={xp}>{xp}</b><small>XP</small>
    {burst > 0 && <span key={burst} className={styles.xpFloat} aria-hidden="true">+{XP_PER_CORRECT}</span>}
  </span>;
}

/** Celebration chip when a streak reaches 3, 5, 10, 15… */
export function StreakBanner({ combo }: { combo: number }) {
  const milestone = combo === 3 || combo === 5 || combo >= 10 && combo % 5 === 0;
  if (!milestone) return null;
  return <div key={combo} className={styles.streakBanner} role="status"><Flame aria-hidden="true" /><strong>{combo} seguidas!</strong><span>{combo >= 10 ? "Lendário" : combo >= 5 ? "Imparável" : "Em chamas"}</span></div>;
}

/** Duolingo-style result strip shown in the answer footer once feedback arrives. */
export function AnswerVerdict({ correct, message, correctAnswer }: { correct: boolean; message: string; correctAnswer?: string | null }) {
  return <section className={styles.verdict} data-correct={correct || undefined} role="status">
    <span className={styles.verdictIcon}>{correct ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}</span>
    <div><strong>{message}</strong>{!correct && correctAnswer ? <small>Resposta certa: {correctAnswer}</small> : correct ? <small>+{XP_PER_CORRECT} XP</small> : null}</div>
  </section>;
}

const PRAISE = ["Boa!", "Certíssimo!", "Isso mesmo!", "Excelente!", "Na mouche!"];

export function praiseFor(correct: boolean, combo: number, seed: string) {
  if (!correct) return "Quase! Fica para a próxima.";
  if (combo >= 10) return `Lendário! ${combo} seguidas`;
  if (combo >= 5) return `Imparável! ${combo} seguidas`;
  if (combo >= 3) return `Em chamas! ${combo} seguidas`;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PRAISE[hash % PRAISE.length];
}

function Bar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <span className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></span>;
}

export function GameStrip({ profile, onRanking }: { profile: QuizGameProfile | null; onRanking: () => void }) {
  if (!profile) return null;
  const goalDone = profile.todayCompleted >= profile.dailyGoal;
  return <section className={styles.strip} aria-label="O teu progresso">
    <div className={styles.tile} data-hot={profile.streakDays >= 3 || undefined}>
      <span className="stat-card__icon stat-card__icon--gold"><Flame aria-hidden="true" /></span>
      <div><span>Sequência</span><strong>{profile.streakDays} {profile.streakDays === 1 ? "dia" : "dias"}</strong><small>{profile.streakDays && !profile.practisedToday ? "Pratica hoje para não a perder" : `Recorde: ${profile.bestStreakDays}`}</small></div>
    </div>
    <div className={styles.tile}>
      <span className={`stat-card__icon ${goalDone ? "stat-card__icon--green" : "stat-card__icon--blue"}`}><Target aria-hidden="true" /></span>
      <div><span>Objetivo de hoje</span><strong>{Math.min(profile.todayCompleted, profile.dailyGoal)}/{profile.dailyGoal}</strong><Bar value={profile.todayCompleted / profile.dailyGoal} label="Objetivo diário" /></div>
    </div>
    <div className={styles.tile}>
      <span className="stat-card__icon stat-card__icon--gold"><Zap aria-hidden="true" /></span>
      <div><span>Nível {profile.level}</span><strong className={styles.levelTitle}>{profile.title}</strong><Bar value={profile.progress} label={`${profile.xp - profile.levelStartXp} de ${profile.nextLevelXp - profile.levelStartXp} XP para o nível ${profile.level + 1}`} /></div>
    </div>
    <button type="button" className={styles.tile} onClick={onRanking}>
      <span className="stat-card__icon stat-card__icon--green"><Trophy aria-hidden="true" /></span>
      <div><span>Testes ≥75%</span><strong>{profile.passedThisWeek}</strong><small>esta semana · ver ranking</small></div>
    </button>
  </section>;
}

export function ComboPill({ combo }: { combo: number }) {
  if (combo < 2) return null;
  return <span key={combo} className={styles.combo} data-level={combo >= 10 ? "3" : combo >= 5 ? "2" : "1"} aria-label={`${combo} respostas certas seguidas`}><Flame aria-hidden="true" />{combo}</span>;
}

const CONFETTI_COLORS = ["var(--color-accent)", "var(--color-success)", "var(--color-info)", "var(--color-danger)", "var(--color-accent-hover)"];

export function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 36 }, (_, index) => ({
    left: (index * 37) % 100,
    delay: (index % 9) * 0.06,
    duration: 1.4 + ((index * 13) % 10) / 10,
    rotate: (index * 47) % 360,
    drift: ((index * 29) % 120) - 60,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  })), []);
  return <span className={styles.confetti} aria-hidden="true">{pieces.map((piece, index) => <i key={index} style={{ left: `${piece.left}%`, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, background: piece.color, "--rotate": `${piece.rotate}deg`, "--drift": `${piece.drift}px` } as CSSProperties} />)}</span>;
}

/** Results summary: score ring, XP earned, combo, daily goal and level-up. */
export function ResultsGame({ correct, total, bestCombo, before, after, onAgain, onSettings, busy }: { correct: number; total: number; bestCombo: number; before: QuizGameProfile | null; after: QuizGameProfile | null; onAgain: () => void; onSettings: () => void; busy: boolean }) {
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const passed = isRankingPass(correct, total);
  const perfect = total > 0 && correct >= total;
  const xp = attemptXp(correct, total);
  const levelBefore = before ? before.level : quizLevel(Math.max(0, (after?.xp ?? xp) - xp)).level;
  const levelUp = after && after.level > levelBefore;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(percent); return; }
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / 900);
      setShown(Math.round(percent * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [percent]);
  useEffect(() => { if (passed) { haptic([30, 40, 60]); playQuizSound("win"); } }, [passed]);
  const headline = perfect ? "Perfeito!" : percent >= 90 ? "Brutal!" : passed ? "Conta para o ranking!" : percent >= 50 ? "Quase lá!" : "Bora outra?";
  const sub = passed ? "Teste com 75% ou mais." : `Faltaram ${Math.max(0, Math.ceil(total * 0.75) - correct)} certas para os 75%.`;
  return <section className={styles.results} data-passed={passed || undefined} aria-labelledby="results-headline">
    {passed && <Confetti />}
    <div className={styles.resultRing} style={{ "--score": `${shown}%` } as CSSProperties}><strong>{shown}%</strong><small>{correct}/{total}</small></div>
    <div className={styles.resultCopy}>
      <h2 id="results-headline">{headline}</h2>
      <p>{sub}</p>
      <ul className={styles.rewards} aria-label="Recompensas">
        <li><Zap aria-hidden="true" />+{xp} XP</li>
        {bestCombo >= 2 && <li><Flame aria-hidden="true" />Melhor série: {bestCombo}</li>}
        {passed && <li data-tone="good"><Trophy aria-hidden="true" />+1 no ranking</li>}
        {levelUp && after && <li data-tone="level"><Star aria-hidden="true" />Subiste para o nível {after.level} · {after.title}</li>}
        {after && <li><Target aria-hidden="true" />Hoje: {Math.min(after.todayCompleted, after.dailyGoal)}/{after.dailyGoal}{after.todayCompleted === after.dailyGoal ? " · objetivo cumprido!" : ""}</li>}
        {after && after.streakDays > 0 && <li><Flame aria-hidden="true" />{after.streakDays} {after.streakDays === 1 ? "dia" : "dias"} seguidos</li>}
      </ul>
    </div>
    <div className={styles.resultActions}>
      <button className="button button--primary" type="button" onClick={onAgain} disabled={busy}><Zap aria-hidden="true" />{busy ? "A preparar…" : "Outra ronda"}</button>
      <button className="button button--secondary" type="button" onClick={onSettings}>Mudar definições</button>
    </div>
  </section>;
}

type RankingEntry = { rank: number; displayName: string; passedCount: number; isMe: boolean; memberId?: string };
type RankingData = { period: RankingPeriod; participantCount: number; leaderboard: RankingEntry[]; me: { member: boolean; displayName: string | null; suggestedName: string; rank: number | null; passedCount: number }; canModerate: boolean };

const PERIODS: Array<{ id: RankingPeriod; label: string }> = [{ id: "week", label: "Semana" }, { id: "month", label: "Mês" }, { id: "all", label: "Sempre" }];

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown aria-hidden="true" />;
  if (rank <= 3) return <Medal aria-hidden="true" />;
  return <>{rank}</>;
}

export function RankingView({ units, profile, onNotice }: { units: Array<{ id: string; code: string; name: string }>; profile: QuizGameProfile | null; onNotice: (kind: "success" | "error", message: string) => void }) {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const [unitId, setUnitId] = useState("");
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [leaving, setLeaving] = useState<RankingEntry | "me" | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/quiz-ranking?period=${period}${unitId ? `&unitId=${encodeURIComponent(unitId)}` : ""}`, { cache: "no-store" });
      const body = await response.json() as RankingData & { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar o ranking.");
      setData(body);
      setName((current) => current || body.me.displayName || body.me.suggestedName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o ranking.");
    } finally { setLoading(false); }
  }, [period, unitId]);

  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/quiz-ranking/membership", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível guardar.");
      const joined = !data?.me.member;
      setEditing(false);
      onNotice("success", joined ? "Estás no ranking. Bora subir!" : "Nome atualizado.");
      if (joined) haptic([20, 30, 20]);
      await load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível guardar.");
    } finally { setSaving(false); }
  }

  async function leave() {
    if (!leaving || removing) return;
    setRemoving(true);
    try {
      const target = leaving === "me" ? "" : `?userId=${encodeURIComponent(leaving.memberId ?? "")}`;
      const response = await fetch(`/api/quiz-ranking/membership${target}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível sair do ranking.");
      onNotice("success", leaving === "me" ? "Saíste do ranking." : "Participante removido do ranking.");
      setLeaving(null);
      await load();
    } catch (reason) {
      onNotice("error", reason instanceof Error ? reason.message : "Não foi possível sair do ranking.");
    } finally { setRemoving(false); }
  }

  const me = data?.me;
  const leavingEntry = leaving && leaving !== "me" ? leaving : null;
  const meVisible = data?.leaderboard.some((entry) => entry.isMe);
  const nextAbove = me?.member && data ? [...data.leaderboard].reverse().find((entry) => entry.passedCount > me.passedCount) : null;
  const joinForm = <form className={styles.joinForm} onSubmit={save}>
    <label htmlFor="ranking-name">Nome no ranking</label>
    <div>
      <input id="ranking-name" className={styles.input} value={name} maxLength={24} minLength={3} required autoComplete="nickname" onChange={(event) => { setName(event.target.value); setFormError(""); }} placeholder="Ex.: Ana S." />
      <button className="button button--primary" type="submit" disabled={saving || name.trim().length < 3}>{saving ? "A guardar…" : me?.member ? "Guardar" : "Participar"}</button>
      {me?.member && <button className="button button--ghost" type="button" onClick={() => { setEditing(false); setName(me.displayName ?? ""); setFormError(""); }}><X aria-hidden="true" />Cancelar</button>}
    </div>
    {formError ? <p className={styles.formError} role="alert">{formError}</p> : <p className={styles.hint}>Só aparecem estudantes que aderem, com o nome que escolherem. Podes sair a qualquer momento.</p>}
  </form>;

  return <div className={styles.stack}>
    {me && !me.member && !loading && <section className={`panel ${styles.joinPanel}`} aria-labelledby="ranking-join">
      <SurfaceHeader icon={<Trophy />} title="Entra no ranking" headingId="ranking-join" />
      <div className={styles.panelBody}>
        <p className={styles.joinLead}>Ganha um lugar por cada teste com <strong>75% ou mais</strong>. Quem fizer mais, sobe.</p>
        {joinForm}
      </div>
    </section>}

    {me?.member && <section className={styles.mePanel} aria-label="A tua posição">
      <span className={styles.meRank} data-top={me.rank !== null && me.rank <= 3 || undefined}>{me.rank ? <><small>#</small>{me.rank}</> : "—"}</span>
      <div>
        <strong>{me.displayName}</strong>
        <small>{me.passedCount} {me.passedCount === 1 ? "teste" : "testes"} ≥75% · {nextAbove ? `faltam ${nextAbove.passedCount - me.passedCount + 1} para passares ${nextAbove.displayName}` : me.rank === 1 ? "estás em 1.º lugar!" : "faz um teste ≥75% para entrares na tabela"}</small>
      </div>
      <span className={styles.meActions}>
        <button className="button button--ghost button--compact" type="button" onClick={() => setEditing((value) => !value)} aria-expanded={editing}><Pencil aria-hidden="true" /><span>Nome</span></button>
        <button className="button button--ghost button--compact" type="button" onClick={() => setLeaving("me")}><LogOut aria-hidden="true" /><span>Sair</span></button>
      </span>
      {editing && <div className={styles.meEdit}>{joinForm}</div>}
    </section>}

    <section className={`panel ${styles.boardPanel}`} aria-labelledby="ranking-title">
      <SurfaceHeader icon={<Users />} title="Ranking · testes com 75% ou mais" headingId="ranking-title" meta={data ? `${data.participantCount} ${data.participantCount === 1 ? "participante" : "participantes"}` : undefined} />
      <div className={styles.boardTools}>
        <div className={styles.segmented} role="radiogroup" aria-label="Período">{PERIODS.map((item) => <button key={item.id} type="button" role="radio" aria-checked={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>)}</div>
        <label className="sr-only" htmlFor="ranking-unit">Disciplina</label>
        <select id="ranking-unit" className={styles.unitSelect} value={unitId} onChange={(event) => setUnitId(event.target.value)}>
          <option value="">Todas as disciplinas</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}
        </select>
      </div>
      {loading && !data ? <RecordSkeleton label="A carregar o ranking" rows={4} /> : error ? <p className={styles.empty} role="alert">{error} <button className="button button--secondary button--compact" type="button" onClick={() => void load()}>Tentar novamente</button></p> : data && data.leaderboard.length ? <ol className={styles.board} aria-busy={loading || undefined}>
        {data.leaderboard.map((entry) => <li key={`${entry.rank}-${entry.displayName}`} className={styles.boardRow} data-rank={entry.rank <= 3 ? entry.rank : undefined} data-me={entry.isMe || undefined}>
          <span className={styles.position}><RankIcon rank={entry.rank} /></span>
          <span className={styles.name}>{entry.displayName}{entry.isMe && <em>Tu</em>}</span>
          <span className={styles.count}><b>{entry.passedCount}</b><small>{entry.passedCount === 1 ? "teste" : "testes"}</small></span>
          {data.canModerate && entry.memberId && !entry.isMe && <button className={styles.remove} type="button" aria-label={`Remover ${entry.displayName} do ranking`} title="Remover do ranking" onClick={() => setLeaving(entry)}><X aria-hidden="true" /></button>}
        </li>)}
        {me?.member && !meVisible && me.rank && <li className={styles.boardRow} data-me>
          <span className={styles.position}>{me.rank}</span><span className={styles.name}>{me.displayName}<em>Tu</em></span><span className={styles.count}><b>{me.passedCount}</b><small>testes</small></span>
        </li>}
      </ol> : <p className={styles.empty}>{period === "week" ? "Ainda ninguém pontuou esta semana. O primeiro lugar está à tua espera." : "Ainda não há testes com 75% ou mais neste período."}</p>}
    </section>

    {profile && <section className={`panel ${styles.badgesPanel}`} aria-labelledby="badges-title">
      <SurfaceHeader icon={<Award />} title="Conquistas" headingId="badges-title" meta={`${profile.badges.filter((badge) => badge.earned).length}/${profile.badges.length}`} />
      <ul className={styles.badges}>{profile.badges.map((badge) => <li key={badge.id} data-earned={badge.earned || undefined} title={badge.description}>
        <span>{badge.earned ? <Award aria-hidden="true" /> : <Lock aria-hidden="true" />}</span>
        <strong>{badge.title}</strong><small>{badge.description}</small>
        <span className="sr-only">{badge.earned ? "Conquistada" : "Por conquistar"}</span>
      </li>)}</ul>
    </section>}

    <ConfirmationDialog open={Boolean(leaving)} eyebrow="Ranking" title={leavingEntry ? `Remover ${leavingEntry.displayName}?` : "Sair do ranking?"} subject={leavingEntry?.displayName} subjectLabel="Participante" description={leaving === "me" ? "Deixas de aparecer na tabela. Os teus testes e estatísticas mantêm-se e podes voltar quando quiseres." : "O participante deixa de aparecer na tabela até voltar a aderir."} confirmLabel={removing ? "A remover…" : leaving === "me" ? "Sair do ranking" : "Remover"} busy={removing} icon={<LogOut />} onClose={() => setLeaving(null)} onConfirm={() => void leave()} />
  </div>;
}
