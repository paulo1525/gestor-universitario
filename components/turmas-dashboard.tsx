"use client";

import Image from "next/image";
import {
  ArrowRightLeft,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Estado = "Validada" | "Em revisão" | "Por submeter";
type Preferencia = "Ficar" | "Mudar";

type Turma = {
  id: number;
  nome: string;
  representante: string;
  alunos: number;
  capacidade: number;
  ficam: number;
  mudam: number;
  estado: Estado;
};

type Aluno = {
  id: number;
  nome: string;
  numero: string;
  preferencia: Preferencia;
  destino?: string;
};

const turmasIniciais: Turma[] = [
  { id: 1, nome: "Turma 1", representante: "Mariana Sousa", alunos: 31, capacidade: 32, ficam: 25, mudam: 6, estado: "Validada" },
  { id: 2, nome: "Turma 2", representante: "Afonso Lima", alunos: 30, capacidade: 32, ficam: 22, mudam: 8, estado: "Em revisão" },
  { id: 3, nome: "Turma 3", representante: "Inês Ribeiro", alunos: 32, capacidade: 32, ficam: 28, mudam: 4, estado: "Validada" },
  { id: 4, nome: "Turma 4", representante: "Tomás Rocha", alunos: 29, capacidade: 32, ficam: 20, mudam: 9, estado: "Em revisão" },
  { id: 5, nome: "Turma 5", representante: "Leonor Alves", alunos: 31, capacidade: 32, ficam: 0, mudam: 0, estado: "Por submeter" },
  { id: 6, nome: "Turma 6", representante: "Diogo Martins", alunos: 30, capacidade: 32, ficam: 24, mudam: 6, estado: "Em revisão" },
];

const alunosIniciais: Aluno[] = [
  { id: 1, nome: "Beatriz Ferreira", numero: "up202501234", preferencia: "Ficar" },
  { id: 2, nome: "Gonçalo Teixeira", numero: "up202501418", preferencia: "Mudar", destino: "Turma 3" },
  { id: 3, nome: "Marta Correia", numero: "up202501562", preferencia: "Ficar" },
  { id: 4, nome: "Pedro Carvalho", numero: "up202501731", preferencia: "Mudar", destino: "Turma 4" },
];

const estadoClasse: Record<Estado, string> = {
  Validada: "status status--success",
  "Em revisão": "status status--warning",
  "Por submeter": "status status--neutral",
};

export function TurmasDashboard() {
  const [pesquisa, setPesquisa] = useState("");
  const [filtro, setFiltro] = useState<"Todas" | Estado>("Todas");
  const [turmaSelecionada, setTurmaSelecionada] = useState(2);
  const [menuAberto, setMenuAberto] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [alunos, setAlunos] = useState(alunosIniciais);
  const [preferencia, setPreferencia] = useState<Preferencia>("Ficar");

  const turmasFiltradas = useMemo(() => {
    const termo = pesquisa.trim().toLocaleLowerCase("pt-PT");
    return turmasIniciais.filter((turma) => {
      const correspondeTexto =
        turma.nome.toLocaleLowerCase("pt-PT").includes(termo) ||
        turma.representante.toLocaleLowerCase("pt-PT").includes(termo);
      return correspondeTexto && (filtro === "Todas" || turma.estado === filtro);
    });
  }, [filtro, pesquisa]);

  const turmaAtual = turmasIniciais.find((turma) => turma.id === turmaSelecionada) ?? turmasIniciais[0];

  function adicionarAluno(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = new FormData(event.currentTarget);
    const nome = String(dados.get("nome") ?? "").trim();
    const numero = String(dados.get("numero") ?? "").trim();
    const destino = String(dados.get("destino") ?? "").trim();

    if (!nome || !numero || (preferencia === "Mudar" && !destino)) return;

    setAlunos((atuais) => [
      ...atuais,
      {
        id: Date.now(),
        nome,
        numero,
        preferencia,
        destino: preferencia === "Mudar" ? destino : undefined,
      },
    ]);
    setModalAberto(false);
    setPreferencia("Ficar");
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo-principal">Saltar para o conteúdo</a>

      <aside className={`sidebar ${menuAberto ? "sidebar--open" : ""}`} aria-label="Navegação principal">
        <div className="brand">
          <Image
            className="brand__logo"
            src="/logo-comissao-curso-fmup-2025-2031.png"
            alt="Comissão de Curso FMUP 2025–2031"
            width={58}
            height={58}
            priority
          />
          <div>
            <span className="brand__name">Gestor Universitário</span>
            <span className="brand__context">Comissão de Curso</span>
          </div>
          <button className="icon-button sidebar__close" type="button" onClick={() => setMenuAberto(false)} aria-label="Fechar menu">
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <nav className="nav-list" aria-label="Área de turmas">
          <span className="nav-label">Gestão de turmas</span>
          <a href="#visao-geral">
            <LayoutDashboard aria-hidden="true" size={19} />
            Visão geral
          </a>
          <a className="is-active" href="#turmas" aria-current="page">
            <Users aria-hidden="true" size={19} />
            Turmas
            <span className="nav-count">6</span>
          </a>
          <a href="#submissoes">
            <FileCheck2 aria-hidden="true" size={19} />
            Submissões
            <span className="nav-count nav-count--warning">3</span>
          </a>
          <a href="#permutas">
            <ArrowRightLeft aria-hidden="true" size={19} />
            Permutas
          </a>
        </nav>

        <div className="sidebar__footer">
          <div className="security-note">
            <ShieldCheck aria-hidden="true" size={18} />
            <div><strong>Ambiente protegido</strong><span>Dados fictícios nesta versão</span></div>
          </div>
          <button className="profile" type="button">
            <span className="avatar" aria-hidden="true">CC</span>
            <span><strong>Comissão de Curso</strong><small>Administrador</small></span>
            <ChevronDown aria-hidden="true" size={17} />
          </button>
        </div>
      </aside>

      {menuAberto && <button className="sidebar-backdrop" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" />}

      <div className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
            <Menu aria-hidden="true" size={22} />
          </button>
          <div className="breadcrumbs" aria-label="Localização atual">
            <span>Gestão de turmas</span><ChevronRight aria-hidden="true" size={15} /><strong>Visão geral</strong>
          </div>
          <div className="topbar__actions">
            <button className="icon-button has-notification" type="button" aria-label="Notificações: 2 novas">
              <Bell aria-hidden="true" size={20} />
            </button>
            <button className="icon-button" type="button" aria-label="Definições">
              <Settings2 aria-hidden="true" size={20} />
            </button>
          </div>
        </header>

        <div className="announcement" role="status">
          <Clock3 aria-hidden="true" size={18} />
          <span><strong>Submissões abertas</strong> até 18 de julho, às 23:59.</span>
          <a href="#submissoes">Ver estado</a>
        </div>

        <main id="conteudo-principal" className="main-content">
          <section className="page-heading" id="visao-geral">
            <div>
              <span className="eyebrow">Ano letivo 2026/2027</span>
              <h1>Turmas do 2.º ano</h1>
              <p>Acompanhe as listas submetidas e prepare as permutações sem alterar quem prefere ficar.</p>
            </div>
            <button className="button button--primary" type="button" onClick={() => setModalAberto(true)}>
              <Plus aria-hidden="true" size={18} />Adicionar aluno
            </button>
          </section>

          <section className="stats-grid" aria-label="Resumo das turmas">
            <article className="stat-card">
              <span className="stat-card__icon stat-card__icon--ink"><Users aria-hidden="true" size={21} /></span>
              <div><span>Total de alunos</span><strong>183</strong><small>em 6 turmas</small></div>
            </article>
            <article className="stat-card">
              <span className="stat-card__icon stat-card__icon--green"><LockKeyhole aria-hidden="true" size={21} /></span>
              <div><span>Preferem ficar</span><strong>119</strong><small>65% já bloqueados</small></div>
            </article>
            <article className="stat-card">
              <span className="stat-card__icon stat-card__icon--gold"><ArrowRightLeft aria-hidden="true" size={21} /></span>
              <div><span>Preferem mudar</span><strong>33</strong><small>elegíveis para permuta</small></div>
            </article>
            <article className="stat-card">
              <span className="stat-card__icon stat-card__icon--blue"><FileCheck2 aria-hidden="true" size={21} /></span>
              <div><span>Turmas validadas</span><strong>2/6</strong><small>3 em revisão</small></div>
            </article>
          </section>

          <section className="content-grid" id="turmas">
            <div className="panel panel--table">
              <div className="panel__header">
                <div><h2>Estado das turmas</h2><p>Selecione uma turma para consultar os detalhes.</p></div>
                <div className="panel-tools">
                  <label className="search-field">
                    <span className="sr-only">Pesquisar turma ou representante</span>
                    <Search aria-hidden="true" size={18} />
                    <input value={pesquisa} onChange={(event) => setPesquisa(event.target.value)} placeholder="Pesquisar..." />
                  </label>
                  <label className="select-field">
                    <span className="sr-only">Filtrar por estado</span>
                    <select value={filtro} onChange={(event) => setFiltro(event.target.value as "Todas" | Estado)}>
                      <option>Todas</option><option>Validada</option><option>Em revisão</option><option>Por submeter</option>
                    </select>
                    <ChevronDown aria-hidden="true" size={16} />
                  </label>
                </div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead><tr><th>Turma</th><th>Representante</th><th>Ocupação</th><th>Preferências</th><th>Estado</th><th><span className="sr-only">Ações</span></th></tr></thead>
                  <tbody>
                    {turmasFiltradas.map((turma) => {
                      const ativa = turma.id === turmaSelecionada;
                      return (
                        <tr key={turma.id} className={ativa ? "is-selected" : ""}>
                          <td><button className="table-link" type="button" onClick={() => setTurmaSelecionada(turma.id)} aria-pressed={ativa}>{turma.nome}</button></td>
                          <td>{turma.representante}</td>
                          <td><div className="occupancy"><span>{turma.alunos}/{turma.capacidade}</span><span className="progress"><span style={{ width: `${(turma.alunos / turma.capacidade) * 100}%` }} /></span></div></td>
                          <td>{turma.estado === "Por submeter" ? <span className="muted">—</span> : <div className="preference-counts"><span><i className="dot dot--green" />{turma.ficam} ficam</span><span><i className="dot dot--gold" />{turma.mudam} mudam</span></div>}</td>
                          <td><span className={estadoClasse[turma.estado]}>{turma.estado}</span></td>
                          <td><button className="row-action" type="button" onClick={() => setTurmaSelecionada(turma.id)} aria-label={`Abrir ${turma.nome}`}><ChevronRight aria-hidden="true" size={18} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {turmasFiltradas.length === 0 && <div className="empty-state">Não encontrámos turmas com estes filtros.</div>}
              </div>
            </div>

            <aside className="panel detail-panel" aria-label={`Detalhes da ${turmaAtual.nome}`}>
              <div className="detail-panel__top">
                <span className="detail-icon"><Users aria-hidden="true" size={22} /></span>
                <div><span className="eyebrow">Turma selecionada</span><h2>{turmaAtual.nome}</h2></div>
                <button className="icon-button" type="button" aria-label={`Mais opções para ${turmaAtual.nome}`}><Settings2 aria-hidden="true" size={19} /></button>
              </div>
              <dl className="detail-list">
                <div><dt>Representante</dt><dd>{turmaAtual.representante}</dd></div>
                <div><dt>Alunos</dt><dd>{turmaAtual.alunos} de {turmaAtual.capacidade}</dd></div>
                <div><dt>Estado</dt><dd><span className={estadoClasse[turmaAtual.estado]}>{turmaAtual.estado}</span></dd></div>
              </dl>
              <div className="detail-summary">
                <div><span>Ficam bloqueados</span><strong>{turmaAtual.ficam}</strong></div>
                <div><span>Pedem mudança</span><strong>{turmaAtual.mudam}</strong></div>
              </div>
              <div className="validation-card">
                <Check aria-hidden="true" size={18} />
                <div><strong>Validações automáticas</strong><span>Sem números mecanográficos duplicados.</span></div>
              </div>
              <button className="button button--secondary button--full" type="button">Abrir formulário da turma<ChevronRight aria-hidden="true" size={17} /></button>
            </aside>
          </section>

          <section className="panel roster-panel" id="submissoes">
            <div className="panel__header">
              <div><h2>Amostra da submissão — Turma 2</h2><p>Dados fictícios para demonstrar o formulário do representante.</p></div>
              <span className="status status--warning">Rascunho</span>
            </div>
            <div className="student-list">
              {alunos.map((aluno) => (
                <article className="student-row" key={aluno.id}>
                  <span className="student-avatar" aria-hidden="true">{aluno.nome.split(" ").map((parte) => parte[0]).slice(0, 2).join("")}</span>
                  <div className="student-identity"><strong>{aluno.nome}</strong><span>{aluno.numero}</span></div>
                  <span className={`preference-pill ${aluno.preferencia === "Ficar" ? "preference-pill--stay" : "preference-pill--move"}`}>
                    {aluno.preferencia === "Ficar" ? <LockKeyhole aria-hidden="true" size={14} /> : <ArrowRightLeft aria-hidden="true" size={14} />}{aluno.preferencia}
                  </span>
                  <span className="student-destination">{aluno.destino ?? "Turma atual"}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="panel exchange-panel" id="permutas">
            <CircleAlert aria-hidden="true" size={22} />
            <div><h2>Motor de permutas ainda não executado</h2><p>Fica disponível depois de todas as turmas serem submetidas e validadas.</p></div>
            <button className="button button--disabled" type="button" disabled>Preparar permutas</button>
          </section>
        </main>
      </div>

      {modalAberto && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalAberto(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal__header"><div><span className="eyebrow">Turma 2</span><h2 id="modal-title">Adicionar aluno</h2></div><button className="icon-button" type="button" onClick={() => setModalAberto(false)} aria-label="Fechar"><X aria-hidden="true" size={20} /></button></div>
            <form onSubmit={adicionarAluno}>
              <label className="field"><span>Nome completo</span><input name="nome" autoFocus required placeholder="Ex.: Maria Silva Santos" /></label>
              <label className="field"><span>Número mecanográfico</span><input name="numero" required pattern="up[0-9]+" placeholder="up202501234" /><small>Utilize o formato institucional, sem espaços.</small></label>
              <fieldset className="choice-group"><legend>Preferência do aluno</legend><label className={preferencia === "Ficar" ? "is-checked" : ""}><input type="radio" name="preferencia" value="Ficar" checked={preferencia === "Ficar"} onChange={() => setPreferencia("Ficar")} /><LockKeyhole aria-hidden="true" size={18} /><span><strong>Prefere ficar</strong><small>Fica bloqueado na turma atual.</small></span></label><label className={preferencia === "Mudar" ? "is-checked" : ""}><input type="radio" name="preferencia" value="Mudar" checked={preferencia === "Mudar"} onChange={() => setPreferencia("Mudar")} /><ArrowRightLeft aria-hidden="true" size={18} /><span><strong>Prefere mudar</strong><small>Fica elegível para permuta.</small></span></label></fieldset>
              {preferencia === "Mudar" && <label className="field"><span>Turma de destino preferida</span><select name="destino" required defaultValue=""><option value="" disabled>Selecione uma turma</option>{turmasIniciais.filter((turma) => turma.id !== 2).map((turma) => <option key={turma.id}>{turma.nome}</option>)}</select></label>}
              <div className="modal__actions"><button className="button button--ghost" type="button" onClick={() => setModalAberto(false)}>Cancelar</button><button className="button button--primary" type="submit">Adicionar aluno</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
