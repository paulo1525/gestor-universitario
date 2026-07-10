"use client";

import Link from "next/link";
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronRight, Search, Scale, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EstadoTurma, regraTurmas, turmas } from "@/data/turmas";

const estadoClasse: Record<EstadoTurma, string> = {
  Validada: "status status--success",
  "Em preenchimento": "status status--warning",
  "Por submeter": "status status--neutral",
  "Exceção pendente": "status status--danger",
};

export function TurmasDashboard() {
  const [pesquisa, setPesquisa] = useState("");
  const [filtro, setFiltro] = useState<"Todas" | EstadoTurma>("Todas");

  const turmasFiltradas = useMemo(() => {
    const termo = pesquisa.trim().toLocaleLowerCase("pt-PT");
    return turmas.filter((turma) => {
      const corresponde = turma.nome.toLocaleLowerCase("pt-PT").includes(termo) || turma.representante.toLocaleLowerCase("pt-PT").includes(termo);
      return corresponde && (filtro === "Todas" || turma.estado === filtro);
    });
  }, [filtro, pesquisa]);

  const totalAlunos = turmas.reduce((total, turma) => total + turma.alunos, 0);
  const validadas = turmas.filter((turma) => turma.estado === "Validada").length;
  const menor = Math.min(...turmas.map((turma) => turma.alunos));
  const maior = Math.max(...turmas.map((turma) => turma.alunos));

  return (
    <AppShell active="overview">
      <section className="page-heading page-heading--simple">
        <div><span className="eyebrow">Ano letivo 2026/2027</span><h1>Visão geral das turmas</h1><p>Acompanhe a constituição das 20 turmas e abra cada uma para consultar ou editar a respetiva lista.</p></div>
      </section>

      <section className="stats-grid" aria-label="Resumo das turmas">
        <article className="stat-card"><span className="stat-card__icon stat-card__icon--ink"><Users aria-hidden="true" size={21} /></span><div><span>Total de alunos</span><strong>{totalAlunos}</strong><small>distribuídos pelo 2.º ano</small></div></article>
        <article className="stat-card"><span className="stat-card__icon stat-card__icon--blue"><Building2 aria-hidden="true" size={21} /></span><div><span>Turmas previstas</span><strong>20</strong><small>número obrigatório</small></div></article>
        <article className="stat-card"><span className="stat-card__icon stat-card__icon--green"><CheckCircle2 aria-hidden="true" size={21} /></span><div><span>Turmas validadas</span><strong>{validadas}/20</strong><small>restantes em preparação</small></div></article>
        <article className="stat-card"><span className="stat-card__icon stat-card__icon--gold"><Scale aria-hidden="true" size={21} /></span><div><span>Intervalo atual</span><strong>{menor}–{maior}</strong><small>1 exceção pendente</small></div></article>
      </section>

      <section className="rules-panel" aria-labelledby="rules-title">
        <div className="rules-panel__icon"><Scale aria-hidden="true" size={23} /></div>
        <div className="rules-panel__intro"><span className="eyebrow">Regra de constituição</span><h2 id="rules-title">Equilíbrio entre as 20 turmas</h2><p>No 2.º e 3.º anos, a diferença entre a turma menor e a maior não deve exceder três estudantes.</p></div>
        <dl className="rules-panel__facts"><div><dt>Exemplo normal</dt><dd>{regraTurmas.intervaloExemplo} estudantes</dd></div><div><dt>Discrepância</dt><dd>Máximo de {regraTurmas.discrepanciaNormal}</dd></div><div className="rules-panel__exception"><dt>Fora da regra</dt><dd><AlertTriangle aria-hidden="true" size={14} /> Validação da Direção</dd></div></dl>
      </section>

      <section className="panel overview-panel" id="turmas">
        <div className="panel__header">
          <div><h2>Estado das turmas</h2><p>Toque numa turma para abrir a lista completa de alunos.</p></div>
          <div className="panel-tools">
            <label className="search-field"><span className="sr-only">Pesquisar turma ou representante</span><Search aria-hidden="true" size={18} /><input value={pesquisa} onChange={(event) => setPesquisa(event.target.value)} placeholder="Pesquisar..." /></label>
            <label className="select-field"><span className="sr-only">Filtrar por estado</span><select value={filtro} onChange={(event) => setFiltro(event.target.value as "Todas" | EstadoTurma)}><option>Todas</option><option>Validada</option><option>Em preenchimento</option><option>Por submeter</option><option>Exceção pendente</option></select><ChevronDown aria-hidden="true" size={16} /></label>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Turma</th><th>Representante</th><th>Alunos</th><th>Preferências</th><th>Estado</th><th><span className="sr-only">Abrir</span></th></tr></thead>
            <tbody>{turmasFiltradas.map((turma) => <tr key={turma.id} className={turma.estado === "Exceção pendente" ? "row--attention" : ""}><td><Link className="table-link table-link--route" href={`/turmas/${turma.id}`}>{turma.nome}</Link></td><td>{turma.representante}</td><td><strong>{turma.alunos}</strong></td><td><div className="preference-counts preference-counts--inline"><span><i className="dot dot--green" />{turma.ficam} ficam</span><span><i className="dot dot--gold" />{turma.mudam} mudam</span></div></td><td><span className={estadoClasse[turma.estado]}>{turma.estado}</span></td><td><Link className="row-action row-action--link" href={`/turmas/${turma.id}`} aria-label={`Abrir ${turma.nome}`}><ChevronRight aria-hidden="true" size={18} /></Link></td></tr>)}</tbody>
          </table>
          {turmasFiltradas.length === 0 && <div className="empty-state">Não encontrámos turmas com estes filtros.</div>}
        </div>
      </section>
    </AppShell>
  );
}
