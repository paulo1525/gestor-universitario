/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Download, Play, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";

type Result = {
  ready: boolean;
  checkedAt: number;
  summary: { classes: number; students: number; blockers: number; warnings: number };
  issues: Array<{ severity: "blocker" | "warning"; code: string; message: string; classId?: number }>;
};

type Proposal = { id: string; seed: string; status: string; input_snapshot?: string; result_snapshot?: string; invalidated_at?: number; engine_version?: string; created_at: number; reviews?: Array<{ student_id: string; status: string }> };
type MoveSummary = { studentId: string; originClass: number; destinationClass: number; rank: number | null; status: string; manualReview: boolean; randomized: boolean; supportMatched: boolean; groupMatched: boolean; friendMatched?: boolean };

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function isResult(value: unknown): value is Result {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Result>;
  return typeof candidate.ready === "boolean"
    && typeof candidate.checkedAt === "number"
    && Boolean(candidate.summary)
    && Array.isArray(candidate.issues);
}

function getApiError(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string" && value.error.trim()) return value.error;
  return fallback;
}

function parseMoves(snapshot?: string): MoveSummary[] {
  if (!snapshot) return [];
  try {
    const parsed = JSON.parse(snapshot);
    return Array.isArray(parsed) ? parsed as MoveSummary[] : [];
  } catch {
    return [];
  }
}

function parseNames(snapshot?: string) {
  try { const parsed = JSON.parse(snapshot || "{}"); const students = Array.isArray(parsed) ? parsed : parsed.students; return new Map((Array.isArray(students) ? students : []).map((student: { id: string; studentNumber?: string }) => [student.id, student.studentNumber || student.id])); } catch { return new Map<string, string>(); }
}

export function DistributionCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [notice, setNotice] = useState("");

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const [check, history] = await Promise.all([
        fetch("/api/admin/distribution-check", { cache: "no-store" }),
        fetch("/api/admin/distribution-proposals", { cache: "no-store" }),
      ]);
      const checkData = await readJson<unknown>(check);
      const historyData = await readJson<{ proposals?: Proposal[] }>(history);

      if (!check.ok || !isResult(checkData)) {
        setResult(null);
        setProposals([]);
        setNotice(getApiError(checkData, "Não foi possível validar a distribuição. Verifica a sessão e as permissões de administrador."));
        return;
      }

      setResult(checkData);
      if (history.ok && Array.isArray(historyData?.proposals)) {
        setProposals(historyData.proposals);
      } else {
        setProposals([]);
        setNotice(getApiError(historyData, "A validação foi carregada, mas não foi possível carregar o histórico de propostas."));
      }
    } catch {
      setResult(null);
      setProposals([]);
      setNotice("Não foi possível contactar o servidor local. Tenta novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void run(); }, [run]);

  async function act(kind: string, id?: string, studentId?: string) {
    setAction(kind);
    try {
      const response = await fetch(`/api/admin/distribution-proposals/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, studentId }),
      });
      const data = await readJson<unknown>(response);
      setNotice(response.ok ? "Operação concluída e registada." : getApiError(data, "Não foi possível concluir."));
      if (response.ok) await run();
    } catch {
      setNotice("Não foi possível contactar o servidor local. Tenta novamente em instantes.");
    } finally {
      setAction("");
    }
  }

  const latest = proposals[0];
  const moves = parseMoves(latest?.result_snapshot);
  const names = parseNames(latest?.input_snapshot);

  return <AuthGuard requireAdmin><AppShell active="check" breadcrumb="Verificador de distribuição">
    <section className="page-heading">
      <div><span className="eyebrow">Distribuição e permutas</span><h1>Verificador de distribuição</h1><p>Valida os dados e controla propostas versionadas antes de alterar colocações.</p></div>
      <button className="button button--secondary" onClick={() => void run()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} />Verificar novamente</button>
    </section>
    {notice && <p className="admin-notice">{notice}</p>}
    {result && <>
      <section className={`verification-hero ${result.ready ? "is-ready" : "is-blocked"}`}>
        {result.ready ? <CheckCircle2 /> : <ShieldAlert />}
        <div><strong>{result.ready ? "Dados prontos para calcular" : "Distribuição bloqueada"}</strong><span>{result.summary.blockers} bloqueadores · {result.summary.warnings} avisos · {result.summary.students} estudantes</span></div>
      </section>

      <section className="panel distribution-export">
        <div className="distribution-export__copy"><span className="eyebrow">Dados para análise</span><h2>Exportação administrativa</h2><p>Descarrega um Excel completo com as pessoas, decisões, preferências ordenadas, colegas indicados, situações a considerar, notas e resultado da distribuição. O ficheiro inclui informação confidencial.</p></div>
        <a className="button button--secondary" href="/api/admin/export-validation" download><Download />Exportar Excel completo</a>
      </section>

      <section className="panel distribution-actions"><div><span className="eyebrow">Proposta controlada</span><h2>{latest ? `Última proposta · ${latest.invalidated_at ? "invalidada" : latest.status}` : "Ainda não existe uma proposta"}</h2><p>Motor {latest?.engine_version || "—"}. O cálculo não altera turmas até ser revisto, aprovado e aplicado.</p></div><div>{result.ready && <button className="button button--secondary" disabled={Boolean(action)} onClick={() => void act("calculate")}><Play />Calcular</button>}{latest?.status === "draft" && !latest.invalidated_at && <button className="button button--primary" disabled={Boolean(action)} onClick={() => void act("approve", latest.id)}><Check />Aprovar</button>}{latest?.status === "approved" && <button className="button button--primary" disabled={Boolean(action)} onClick={() => void act("apply", latest.id)}><Play />Aplicar</button>}{latest?.status === "applied" && <><button className="button button--primary" disabled={Boolean(action)} onClick={() => void act("publish", latest.id)}><CheckCircle2 />Publicar</button><button className="button button--secondary button--danger" disabled={Boolean(action)} onClick={() => void act("rollback", latest.id)}><RotateCcw />Reverter</button></>}</div></section>

      <section className="panel"><div className="panel__header"><div><h2>Problemas encontrados</h2><p>Última execução: {new Date(result.checkedAt).toLocaleString("pt-PT")}</p></div></div><div className="verification-list">{result.issues.map((issue, i) => <article key={`${issue.code}-${i}`} className={`verification-issue ${issue.severity}`}><AlertTriangle /><div><strong>{issue.message}</strong><small>{issue.code}{issue.classId ? ` · Turma ${issue.classId}` : ""}</small></div></article>)}{!result.issues.length && <div className="empty-state">Nenhum problema encontrado.</div>}</div></section>
      {latest && <section className="panel proposal-summary"><span>{moves.filter((move) => move.status === "moved").length} mudanças</span><span>{moves.filter((move) => move.status === "fallback").length} fallbacks</span><span>{moves.filter((move) => move.manualReview).length} revisões manuais</span><span>{moves.filter((move) => move.randomized).length} desempates</span><span>{moves.filter((move) => move.supportMatched).length} redes de apoio</span></section>}
      {latest && <section className="panel"><div className="panel__header"><div><h2>Resultados individuais</h2><p>Revê todos os movimentos e valida obrigatoriamente os casos sensíveis.</p></div></div><div className="table-scroll"><table><thead><tr><th>Estudante</th><th>Origem</th><th>Destino</th><th>Preferência</th><th>Sinais</th><th /></tr></thead><tbody>{moves.map(move=>{const review=latest.reviews?.find(item=>item.student_id===move.studentId);return <tr key={move.studentId}><td><strong>{names.get(move.studentId) || move.studentId}</strong></td><td>Turma {move.originClass}</td><td>Turma {move.destinationClass}</td><td>{move.rank ? `${move.rank}.ª` : move.status === "stayed_by_choice" ? "Ficou" : "Fallback"}</td><td>{[move.manualReview&&"Revisão",move.randomized&&"Desempate",move.supportMatched&&"Apoio",move.friendMatched&&"Colega"].filter(Boolean).join(" · ")||"—"}</td><td>{review?.status==="pending"?<button className="button button--secondary button--compact" disabled={Boolean(action)} onClick={()=>void act("review",latest.id,move.studentId)}>Validar caso</button>:review?<CheckCircle2 aria-label="Revisto" />:null}</td></tr>})}</tbody></table></div></section>}
    </>}
  </AppShell></AuthGuard>;
}
