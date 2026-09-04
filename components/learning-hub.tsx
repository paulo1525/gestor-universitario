"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  GraduationCap,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, type ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";
import { RichTextContent } from "@/components/rich-text-editor";
import styles from "@/components/learning-hub.module.css";

type Progress = {
  attemptId: string;
  status: "active" | "completed";
  currentStepPosition: number;
  correctCount: number;
  answeredCount: number;
};

type LearningModule = {
  id: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  stepCount: number;
  exerciseCount: number;
  progress: Progress | null;
};

type StepResponse = {
  selectedOptionId: string | null;
  answerText: string | null;
  correct: boolean;
  correctOptionId: string | null;
  correctAnswer: string;
  explanation: string;
};

type LearningStep = {
  id: string;
  position: number;
  type: "explanation" | "exercise";
  title: string;
  content: string;
  answerFormat: "multiple_choice" | "short_answer" | null;
  question: null | {
    id: string;
    prompt: string;
    imageUrl: string | null;
    difficulty: string;
    options: Array<{ id: string; text: string; position: number }>;
  };
  response: StepResponse | null;
};

type LearningAttempt = {
  id: string;
  moduleId: string;
  status: "active" | "completed";
  currentStepPosition: number;
  answeredCount: number;
  correctCount: number;
};

type SessionData = { module: LearningModule; attempt: LearningAttempt; steps: LearningStep[] };
type Screen = "catalogue" | "session" | "results";
type Notice = { kind: ToastKind; message: string } | null;

function errorMessage(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === "string" ? data.error : fallback;
}

export function LearningHub() {
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [session, setSession] = useState<SessionData | null>(null);
  const [screen, setScreen] = useState<Screen>("catalogue");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  const loadModules = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/learning-modules", { cache: "no-store" });
      const data = await response.json() as { modules?: LearningModule[]; error?: string };
      if (!response.ok) throw new Error(errorMessage(data as Record<string, unknown>, "Não foi possível carregar os percursos."));
      setModules(data.modules || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os percursos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadModules(); }, [loadModules]);

  const openModule = useCallback(async (module: LearningModule) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/learning-modules/${encodeURIComponent(module.id)}/start`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await response.json() as SessionData & { error?: string };
      if (!response.ok) throw new Error(errorMessage(data as unknown as Record<string, unknown>, "Não foi possível iniciar o percurso."));
      setSession(data);
      setScreen(data.attempt.status === "completed" ? "results" : "session");
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível iniciar o percurso." });
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const replaceSession = (next: SessionData) => {
    setSession(next);
    setScreen(next.attempt.status === "completed" ? "results" : "session");
  };

  const currentStep = session?.steps.find((step) => step.position === session.attempt.currentStepPosition) ?? null;
  const completedSteps = session ? Math.max(0, session.attempt.currentStepPosition - 1) : 0;
  const progress = session?.steps.length ? Math.round((completedSteps / session.steps.length) * 100) : 0;

  return <AuthGuard>
    <ModuleGuard moduleKey="quizzes.learning">
      <AppShell active="quizzes" breadcrumb="Aprender matéria" focusMode={screen === "session"}>
        <div className={styles.page}>
          {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
          {screen === "catalogue" && <Catalogue modules={modules} loading={loading} error={error} busy={busy} onOpen={(module) => void openModule(module)} onRetry={() => void loadModules()} />}
          {screen === "session" && session && currentStep && <SessionView key={currentStep.id} data={session} step={currentStep} progress={progress} busy={busy} onBusy={setBusy} onUpdate={replaceSession} onNotice={setNotice} onExit={() => { setScreen("catalogue"); void loadModules(); }} />}
          {screen === "results" && session && <Results data={session} onCatalogue={() => { setScreen("catalogue"); setSession(null); void loadModules(); }} onRestart={() => void openModule(session.module)} busy={busy} />}
        </div>
      </AppShell>
    </ModuleGuard>
  </AuthGuard>;
}

function Catalogue({ modules, loading, error, busy, onOpen, onRetry }: { modules: LearningModule[]; loading: boolean; error: string; busy: boolean; onOpen: (module: LearningModule) => void; onRetry: () => void }) {
  return <>
    <header className={`page-heading page-heading--simple ${styles.pageHeader}`}>
      <div><span className="eyebrow">Aprendizagem interativa</span><h1>Aprender por ciclos</h1><p>Uma explicação curta, um exercício relacionado — e depois o ciclo seguinte.</p></div>
      <Link className="button button--secondary" href="/testes"><ArrowLeft />Testes</Link>
    </header>
    {loading ? <State icon={<LoaderCircle className={styles.spin} />} title="A preparar os percursos" text="A carregar explicações e exercícios." /> : error ? <State icon={<TriangleAlert />} title="Não foi possível carregar os percursos" text={error} action={<button className="button button--secondary" type="button" onClick={onRetry}>Tentar novamente</button>} /> : !modules.length ? <State icon={<CircleHelp />} title="Ainda não há percursos publicados" text="Os primeiros conteúdos aparecerão aqui quando estiverem disponíveis." /> : <section className={styles.moduleList} aria-label="Percursos de aprendizagem">
      {modules.map((module) => {
        const completed = module.progress?.status === "completed";
        const active = module.progress?.status === "active";
        const stepPercent = active && module.stepCount ? Math.round(((module.progress!.currentStepPosition - 1) / module.stepCount) * 100) : completed ? 100 : 0;
        return <article className={styles.moduleCard} key={module.id}>
          <header>
            <span className={styles.moduleIcon}><GraduationCap /></span>
            <div><span className="eyebrow">{module.unitCode} · {module.unitName}</span><h2>{module.title}</h2></div>
            {completed && <span className={styles.completeBadge}><CheckCircle2 />Concluído</span>}
          </header>
          <p>{module.summary}</p>
          <dl className={styles.moduleMeta}>
            <div><BookOpenCheck /><dt>Estrutura</dt><dd>{module.exerciseCount} ciclos</dd></div>
            <div><Clock3 /><dt>Duração</dt><dd>{module.estimatedMinutes} min</dd></div>
            <div><BrainCircuit /><dt>Prática</dt><dd>{module.exerciseCount} exercícios</dd></div>
          </dl>
          {(active || completed) && <div className={styles.savedProgress}><span><span>Progresso guardado</span><strong>{stepPercent}%</strong></span><div aria-label={`${stepPercent}% concluído`}><span style={{ width: `${stepPercent}%` }} /></div></div>}
          <footer><button className="button button--primary" type="button" onClick={() => onOpen(module)} disabled={busy}>{busy ? <LoaderCircle className={styles.spin} /> : completed ? <RotateCcw /> : <Play />}{busy ? "A abrir…" : active ? "Continuar percurso" : completed ? "Repetir percurso" : "Começar percurso"}</button></footer>
        </article>;
      })}
    </section>}
  </>;
}

function SessionView({ data, step, progress, busy, onBusy, onUpdate, onNotice, onExit }: { data: SessionData; step: LearningStep; progress: number; busy: boolean; onBusy: (value: boolean) => void; onUpdate: (data: SessionData) => void; onNotice: (notice: Notice) => void; onExit: () => void }) {
  const [selectedOptionId, setSelectedOptionId] = useState(step.response?.selectedOptionId || "");
  const [answerText, setAnswerText] = useState(step.response?.answerText || "");
  const [response, setResponse] = useState<StepResponse | null>(step.response);
  const explanationNumber = Math.ceil(step.position / 2);
  const exerciseNumber = Math.floor((step.position + 1) / 2);
  const isLast = step.position === data.steps.at(-1)?.position;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!step.question || busy || response) return;
    onBusy(true);
    try {
      const apiResponse = await fetch(`/api/learning-attempts/${encodeURIComponent(data.attempt.id)}/responses`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId: step.id, selectedOptionId: selectedOptionId || null, answerText: answerText || null }),
      });
      const payload = await apiResponse.json() as { response?: StepResponse; error?: string };
      if (!apiResponse.ok || !payload.response) throw new Error(errorMessage(payload as Record<string, unknown>, "Não foi possível corrigir a resposta."));
      setResponse(payload.response);
    } catch (reason) {
      onNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível corrigir a resposta." });
    } finally {
      onBusy(false);
    }
  };

  const advance = async () => {
    if (busy) return;
    onBusy(true);
    try {
      const apiResponse = await fetch(`/api/learning-attempts/${encodeURIComponent(data.attempt.id)}/advance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stepId: step.id }) });
      const payload = await apiResponse.json() as SessionData & { error?: string };
      if (!apiResponse.ok) throw new Error(errorMessage(payload as unknown as Record<string, unknown>, "Não foi possível avançar."));
      onUpdate(payload);
    } catch (reason) {
      onNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível avançar." });
    } finally {
      onBusy(false);
    }
  };

  return <>
    <header className={styles.sessionHeader}>
      <button className={styles.exitButton} type="button" onClick={onExit}><ArrowLeft />Guardar e sair</button>
      <div><span>{data.module.unitCode}</span><strong>{data.module.title}</strong></div>
      <span className={styles.stepCounter}>{step.position}/{data.steps.length}</span>
    </header>
    <div className={styles.progressTrack} aria-label={`${progress}% do percurso concluído`}><span style={{ width: `${progress}%` }} /></div>
    <main className={styles.learningSurface}>
      {step.type === "explanation" ? <article className={styles.explanationCard}>
        <span className={styles.stepLabel}><Sparkles />Explicação {explanationNumber} de {data.module.exerciseCount}</span>
        <h1>{step.title}</h1>
        <RichTextContent value={step.content} className={styles.explanationContent} />
        <footer><button className="button button--primary" type="button" onClick={() => void advance()} disabled={busy}>{busy ? <LoaderCircle className={styles.spin} /> : <ArrowRight />}{busy ? "A avançar…" : "Passar ao exercício"}</button></footer>
      </article> : <form className={styles.exerciseCard} onSubmit={submit}>
        <span className={styles.stepLabel}><BrainCircuit />Exercício {exerciseNumber} de {data.module.exerciseCount}</span>
        <h1>{step.title}</h1>
        {step.question?.imageUrl && <img className={styles.questionImage} src={step.question.imageUrl} alt="Imagem de apoio ao exercício" />}
        <RichTextContent value={step.question?.prompt || ""} className={styles.questionPrompt} />
        {step.answerFormat === "multiple_choice" ? <div className={styles.options} role="radiogroup" aria-label="Opções de resposta">
          {step.question?.options.map((option, index) => {
            const chosen = selectedOptionId === option.id;
            const correct = Boolean(response && response.correctOptionId === option.id);
            const wrong = Boolean(response && chosen && !response.correct);
            return <button key={option.id} type="button" role="radio" aria-checked={chosen} className={`${chosen ? styles.optionSelected : ""} ${correct ? styles.optionCorrect : ""} ${wrong ? styles.optionWrong : ""}`} disabled={Boolean(response) || busy} onClick={() => setSelectedOptionId(option.id)}><span>{String.fromCharCode(65 + index)}</span><strong>{option.text}</strong>{correct && <Check aria-hidden="true" />}{wrong && <XCircle aria-hidden="true" />}</button>;
          })}
        </div> : <label className={styles.shortAnswer}><span>A tua resposta</span><textarea value={answerText} onChange={(event) => setAnswerText(event.target.value)} disabled={Boolean(response) || busy} maxLength={1000} rows={4} placeholder="Escreve uma resposta curta…" /></label>}
        {!response ? <footer><button className="button button--primary" type="submit" disabled={busy || (step.answerFormat === "multiple_choice" ? !selectedOptionId : !answerText.trim())}>{busy ? <LoaderCircle className={styles.spin} /> : <CheckCircle2 />}{busy ? "A verificar…" : "Verificar resposta"}</button></footer> : <>
          <aside className={`${styles.feedback} ${response.correct ? styles.feedbackCorrect : styles.feedbackWrong}`} role="status">
            {response.correct ? <CheckCircle2 /> : <XCircle />}
            <div><strong>{response.correct ? "Resposta certa" : "Ainda não"}</strong>{!response.correct && <p><b>Resposta esperada:</b> {response.correctAnswer}</p>}<RichTextContent value={response.explanation} /></div>
          </aside>
          <footer><button className="button button--primary" type="button" onClick={() => void advance()} disabled={busy}>{busy ? <LoaderCircle className={styles.spin} /> : isLast ? <CheckCircle2 /> : <ArrowRight />}{busy ? "A guardar…" : isLast ? "Concluir percurso" : "Continuar"}</button></footer>
        </>}
      </form>}
    </main>
  </>;
}

function Results({ data, onCatalogue, onRestart, busy }: { data: SessionData; onCatalogue: () => void; onRestart: () => void; busy: boolean }) {
  const percent = data.attempt.answeredCount ? Math.round((data.attempt.correctCount / data.attempt.answeredCount) * 100) : 0;
  return <section className={styles.results}>
    <span className={styles.resultIcon}><CheckCircle2 /></span>
    <span className="eyebrow">Percurso concluído</span>
    <h1>{data.module.title}</h1>
    <p>Terminaste os {data.module.exerciseCount} ciclos de explicação e aplicação.</p>
    <dl><div><dt>Respostas certas</dt><dd>{data.attempt.correctCount}/{data.attempt.answeredCount}</dd></div><div><dt>Precisão</dt><dd>{percent}%</dd></div></dl>
    <footer><button className="button button--secondary" type="button" onClick={onCatalogue}><BookOpenCheck />Outros percursos</button><button className="button button--primary" type="button" onClick={onRestart} disabled={busy}>{busy ? <LoaderCircle className={styles.spin} /> : <RotateCcw />}Repetir</button></footer>
  </section>;
}

function State({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return <section className={styles.state}>{icon}<strong>{title}</strong><p>{text}</p>{action}</section>;
}
