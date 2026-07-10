"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRightLeft, Check, ChevronDown, FilePenLine, LockKeyhole, Plus, Save, Search, Send, Trash2, UserRound, Users } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Aluno, PreferenciaAluno, regraTurmas, Turma, turmas } from "@/data/turmas";

type TurmaDetailProps = { turma: Turma; alunosIniciais: Aluno[] };

function linhaVazia(indice: number): Aluno {
  return { id: `novo-${Date.now()}-${indice}`, nome: "", numero: "", preferencia: "Ficar", destino: "" };
}

export function TurmaDetail({ turma, alunosIniciais }: TurmaDetailProps) {
  const [modo, setModo] = useState<"lista" | "formulario">("lista");
  const [pesquisa, setPesquisa] = useState("");
  const [linhas, setLinhas] = useState(alunosIniciais);
  const [mensagem, setMensagem] = useState("");

  const alunosFiltrados = useMemo(() => {
    const termo = pesquisa.trim().toLocaleLowerCase("pt-PT");
    return linhas.filter((aluno) => aluno.nome.toLocaleLowerCase("pt-PT").includes(termo) || aluno.numero.toLocaleLowerCase("pt-PT").includes(termo));
  }, [linhas, pesquisa]);

  const ficam = linhas.filter((aluno) => aluno.preferencia === "Ficar").length;
  const mudam = linhas.filter((aluno) => aluno.preferencia === "Mudar").length;
  const requerExcecao = linhas.length > 17 || turma.estado === "Exceção pendente";

  function atualizar(id: string, campo: keyof Aluno, valor: string) {
    setLinhas((atuais) => atuais.map((linha) => linha.id === id ? { ...linha, [campo]: valor, ...(campo === "preferencia" && valor === "Ficar" ? { destino: "" } : {}) } : linha));
    setMensagem("");
  }

  function adicionarLinhas(quantidade: number) {
    setLinhas((atuais) => {
      const disponiveis = Math.max(0, regraTurmas.limiteOperacional - atuais.length);
      return [...atuais, ...Array.from({ length: Math.min(quantidade, disponiveis) }, (_, index) => linhaVazia(atuais.length + index))];
    });
  }

  function remover(id: string) { setLinhas((atuais) => atuais.filter((linha) => linha.id !== id)); setMensagem(""); }

  function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    setMensagem(submitter?.value === "submeter" ? "Turma submetida para validação nesta demonstração." : "Rascunho guardado localmente nesta demonstração.");
  }

  return (
    <AppShell active="turmas" breadcrumb={turma.nome}>
      <Link className="back-link" href="/"><ArrowLeft aria-hidden="true" size={17} />Voltar à visão geral</Link>

      <section className="detail-heading">
        <div><span className="eyebrow">2.º ano · 2026/2027</span><h1>{turma.nome}</h1><p>Representante: <strong>{turma.representante}</strong></p></div>
        <div className={`rule-state ${requerExcecao ? "rule-state--warning" : "rule-state--success"}`}>{requerExcecao ? <AlertTriangle aria-hidden="true" size={18} /> : <Check aria-hidden="true" size={18} />}<div><strong>{requerExcecao ? "Exceção pendente" : "Dentro do intervalo"}</strong><span>{requerExcecao ? "Requer validação da Direção" : "Cumpre a discrepância normal"}</span></div></div>
      </section>

      <section className="detail-stats" aria-label="Resumo da turma">
        <article><span><Users aria-hidden="true" size={19} /></span><div><small>Alunos registados</small><strong>{linhas.length}/{regraTurmas.limiteOperacional}</strong></div></article>
        <article><span className="icon-green"><LockKeyhole aria-hidden="true" size={19} /></span><div><small>Preferem ficar</small><strong>{ficam}</strong></div></article>
        <article><span className="icon-gold"><ArrowRightLeft aria-hidden="true" size={19} /></span><div><small>Preferem mudar</small><strong>{mudam}</strong></div></article>
      </section>

      <div className="view-switcher" role="tablist" aria-label="Conteúdo da turma"><button className={modo === "lista" ? "is-active" : ""} type="button" role="tab" aria-selected={modo === "lista"} onClick={() => setModo("lista")}><Users aria-hidden="true" size={17} />Lista de alunos</button><button className={modo === "formulario" ? "is-active" : ""} type="button" role="tab" aria-selected={modo === "formulario"} onClick={() => setModo("formulario")}><FilePenLine aria-hidden="true" size={17} />Formulário do representante</button></div>

      {modo === "lista" ? (
        <section className="panel roster-page-panel">
          <div className="panel__header"><div><h2>Alunos da {turma.nome}</h2><p>Lista fictícia submetida pelo representante.</p></div><label className="search-field"><span className="sr-only">Pesquisar aluno</span><Search aria-hidden="true" size={18} /><input value={pesquisa} onChange={(event) => setPesquisa(event.target.value)} placeholder="Nome ou número..." /></label></div>
          <div className="table-scroll"><table><thead><tr><th>Aluno</th><th>Número mecanográfico</th><th>Preferência</th><th>Destino</th></tr></thead><tbody>{alunosFiltrados.map((aluno) => <tr key={aluno.id}><td><div className="student-name-cell"><span><UserRound aria-hidden="true" size={16} /></span><strong>{aluno.nome || "Aluno por preencher"}</strong></div></td><td>{aluno.numero || "—"}</td><td><span className={`preference-pill ${aluno.preferencia === "Ficar" ? "preference-pill--stay" : "preference-pill--move"}`}>{aluno.preferencia === "Ficar" ? <LockKeyhole aria-hidden="true" size={14} /> : <ArrowRightLeft aria-hidden="true" size={14} />}{aluno.preferencia}</span></td><td>{aluno.destino || "Turma atual"}</td></tr>)}</tbody></table></div>
        </section>
      ) : (
        <form className="panel batch-panel" onSubmit={guardar}>
          <div className="batch-panel__header"><div><span className="eyebrow">Edição em lote</span><h2>Constituição da {turma.nome}</h2><p>Edite toda a turma numa única submissão e acrescente novas linhas quando necessário.</p></div><div className="batch-counter"><strong>{linhas.length}/{regraTurmas.limiteOperacional}</strong><span>alunos</span></div></div>
          {requerExcecao && <div className="inline-warning" role="status"><AlertTriangle aria-hidden="true" size={18} /><div><strong>Esta constituição ultrapassa o intervalo normal de exemplo.</strong><span>Poderá ser submetida, mas fica pendente de validação pela Direção do Mestrado Integrado em Medicina.</span></div></div>}
          <div className="batch-table-wrap"><div className="batch-head" aria-hidden="true"><span>#</span><span>Nome completo</span><span>Número mecanográfico</span><span>Preferência</span><span>Turma de destino</span><span>Ação</span></div><div className="batch-rows">{linhas.map((linha, index) => <div className="batch-row" key={linha.id}><span className="batch-index">{index + 1}</span><label><span className="sr-only">Nome completo do aluno {index + 1}</span><input required value={linha.nome} onChange={(event) => atualizar(linha.id, "nome", event.target.value)} placeholder="Nome completo" /></label><label><span className="sr-only">Número mecanográfico do aluno {index + 1}</span><input required value={linha.numero} onChange={(event) => atualizar(linha.id, "numero", event.target.value)} placeholder="up2025…" pattern="up[0-9]+" /></label><label className="compact-select"><span className="sr-only">Preferência do aluno {index + 1}</span><select value={linha.preferencia} onChange={(event) => atualizar(linha.id, "preferencia", event.target.value as PreferenciaAluno)}><option>Ficar</option><option>Mudar</option></select><ChevronDown aria-hidden="true" size={15} /></label><label className="compact-select"><span className="sr-only">Turma de destino do aluno {index + 1}</span><select value={linha.destino} disabled={linha.preferencia === "Ficar"} required={linha.preferencia === "Mudar"} onChange={(event) => atualizar(linha.id, "destino", event.target.value)}><option value="">{linha.preferencia === "Ficar" ? "Turma atual" : "Selecionar"}</option>{turmas.filter((item) => item.id !== turma.id).map((item) => <option key={item.id}>{item.nome}</option>)}</select><ChevronDown aria-hidden="true" size={15} /></label><button className="delete-row" type="button" onClick={() => remover(linha.id)} aria-label={`Remover aluno ${index + 1}`}><Trash2 aria-hidden="true" size={17} /></button></div>)}</div></div>
          <div className="batch-add-actions"><button className="button button--secondary" type="button" disabled={linhas.length >= regraTurmas.limiteOperacional} onClick={() => adicionarLinhas(1)}><Plus aria-hidden="true" size={17} />Adicionar linha</button><button className="button button--ghost" type="button" disabled={linhas.length >= regraTurmas.limiteOperacional} onClick={() => adicionarLinhas(5)}><Plus aria-hidden="true" size={17} />Adicionar 5 linhas</button><span>Máximo operacional nesta versão: {regraTurmas.limiteOperacional} alunos.</span></div>
          <div className="batch-footer"><div className="save-message" role="status">{mensagem}</div><button className="button button--secondary" type="submit" name="acao" value="rascunho"><Save aria-hidden="true" size={17} />Guardar rascunho</button><button className="button button--primary" type="submit" name="acao" value="submeter"><Send aria-hidden="true" size={17} />Submeter turma</button></div>
        </form>
      )}
    </AppShell>
  );
}
