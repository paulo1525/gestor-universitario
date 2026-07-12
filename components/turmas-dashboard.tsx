"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ChevronRight, Search, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-context";
import { StudentPreferencePanel } from "@/components/student-preference-panel";
import type { EstadoTurma, Turma } from "@/data/turmas";

type ApiClass = { id: number; status: string; submitted_at: number | null; representative: string | null; students: number; stays?: number; moves?: number };
const labels: Record<string, EstadoTurma> = { draft: "Em preenchimento", submitted: "Submetida", review: "Em revisão", reopened: "Reaberta", validated: "Validada", published: "Publicada" };

export function TurmasDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [classes, setClasses] = useState<Turma[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const preferenceOnly = user?.role === "student" && !user.classRepresentative && !user.preview;

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/classes", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { classes?: ApiClass[] };
        setClasses((data.classes || []).map((item) => ({
          id: item.id,
          nome: `Turma ${item.id}`,
          representante: item.representative || "Por atribuir",
          alunos: Number(item.students),
          ficam: Number(item.stays || 0),
          mudam: Number(item.moves || 0),
          estado: labels[item.status] || "Em preenchimento",
        })));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => classes.filter((item) => `${item.nome} ${item.representante}`.toLowerCase().includes(search.toLowerCase().trim())), [classes, search]);
  const total = classes.reduce((count, item) => count + item.alunos, 0);
  const submitted = classes.filter((item) => item.estado !== "Em preenchimento" && item.estado !== "Reaberta").length;

  const classOverview = <section className="panel overview-panel">
    <div className="panel__header">
      <div><h2>{preferenceOnly ? "Turmas base" : "Estado das turmas"}</h2><p>{preferenceOnly ? "Consulta a composição das turmas sem ver as decisões individuais sobre mudança." : "Os alunos podem consultar as decisões já submetidas."}</p></div>
      <label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar turma ou representante" /></label>
    </div>
    <div className="table-scroll"><table><thead><tr><th>Turma</th><th>Representante</th><th>Alunos</th>{!preferenceOnly && <th>Decisões dos estudantes</th>}<th>Estado</th><th /></tr></thead><tbody>{visible.map((item) => <tr className="class-row" tabIndex={0} key={item.id} onClick={() => router.push(`/turmas/${item.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") router.push(`/turmas/${item.id}`); }}><td><strong>{item.nome}</strong></td><td>{item.representante}</td><td>{item.alunos}</td>{!preferenceOnly && <td><div className="preference-counts preference-counts--inline"><span><i className="dot dot--green" />{item.ficam} ficam</span><span><i className="dot dot--gold" />{item.mudam} mudam</span></div></td>}<td><span className="status status--neutral">{item.estado}</span></td><td><ChevronRight size={18} /></td></tr>)}</tbody></table>{loading && <div className="empty-state">A carregar as turmas…</div>}{!loading && !visible.length && <div className="empty-state">Nenhuma turma corresponde à pesquisa.</div>}</div>
  </section>;

  if (preferenceOnly) return <AppShell active="overview"><StudentPreferencePanel />{classOverview}</AppShell>;

  return <AppShell active="overview"><section className="page-heading page-heading--simple"><div><span className="eyebrow">Ano letivo 2026/2027</span><h1>Turmas do 2.º ano</h1></div></section><section className="stats-grid"><article className="stat-card"><span className="stat-card__icon stat-card__icon--ink"><Users /></span><div><span>Alunos registados</span><strong>{total}</strong><small>nas {classes.length} turmas</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--blue"><Building2 /></span><div><span>Turmas criadas</span><strong>{classes.length}</strong><small>todas disponíveis</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--green"><CheckCircle2 /></span><div><span>Submetidas</span><strong>{submitted}/{classes.length}</strong><small>listas entregues</small></div></article></section>{classOverview}</AppShell>;
}
