/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Beaker, Check, Clock3, LockKeyhole, RefreshCcw, Save, ShieldCheck, UserRound, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";

type PersonaId = "admin" | "stay" | "move12" | "move35";
type Phase = "before" | "group12" | "both" | "closed";
type Decision = { destinations: number[]; saved: boolean };

const personas = [
  { id: "admin" as const, name: "Administrador de teste", detail: "Visão administrativa", classId: null },
  { id: "stay" as const, name: "Ana Martins", detail: "Quer permanecer", classId: 1 },
  { id: "move12" as const, name: "Bruno Costa", detail: "Quer mudar", classId: 2 },
  { id: "move35" as const, name: "Carla Sousa", detail: "Quer mudar", classId: 4 },
];
const classes = [
  { id: 1, representative: "Inês Almeida", students: 25 }, { id: 2, representative: "Miguel Rocha", students: 24 },
  { id: 3, representative: "Leonor Pinto", students: 26 }, { id: 4, representative: "Diogo Silva", students: 25 },
  { id: 5, representative: "Marta Pereira", students: 24 },
];
const initial: Record<Exclude<PersonaId, "admin">, Decision> = {
  stay: { destinations: [], saved: true }, move12: { destinations: [1, 3], saved: true }, move35: { destinations: [5, 3], saved: true },
};
const phaseLabels: Record<Phase, string> = { before: "Antes da abertura", group12: "Turmas 1–2 abertas", both: "Turmas 1–5 abertas", closed: "Prazos encerrados" };

export function TestEnvironment() {
  const [persona, setPersona] = useState<PersonaId>("admin"), [phase, setPhase] = useState<Phase>("group12"), [decisions, setDecisions] = useState(initial), [notice, setNotice] = useState("");
  useEffect(() => { try { const saved = localStorage.getItem("gu-test-environment"); if (saved) setDecisions(JSON.parse(saved) as typeof initial); } catch {} }, []);
  const selected = personas.find(item => item.id === persona)!;
  const isAdmin = persona === "admin", beforeOpen = phase === "before" || (phase === "group12" && (selected.classId || 0) >= 3), closed = phase === "closed";
  const locked = !isAdmin && (beforeOpen || closed), currentDecision = persona === "admin" ? null : decisions[persona];
  const counts = useMemo(() => ({ stays: Object.values(decisions).filter(item => !item.destinations.length).length, moves: Object.values(decisions).filter(item => item.destinations.length).length }), [decisions]);
  const update = (destinations: number[]) => { if (persona === "admin") return; setDecisions(current => ({ ...current, [persona]: { destinations, saved: false } })); setNotice(""); };
  const save = () => { if (persona === "admin" || locked) return; const next = { ...decisions, [persona]: { ...decisions[persona], saved: true } }; setDecisions(next); localStorage.setItem("gu-test-environment", JSON.stringify(next)); setNotice("Preferências de teste guardadas. Nenhum dado real foi alterado."); };
  const reset = () => { setDecisions(initial); localStorage.removeItem("gu-test-environment"); setNotice("Dados fictícios repostos."); };

  return <AppShell active="testing" breadcrumb="Ambiente de testes">
    <div className="test-banner"><Beaker/><div><strong>AMBIENTE DE TESTES</strong><span>Todos os nomes, turmas e resultados desta página são fictícios.</span></div><button type="button" onClick={reset}><RefreshCcw/>Repor dados</button></div>
    <section className="test-switcher" aria-label="Simulação de utilizadores"><div><span>Ver como</span><div className="test-personas">{personas.map(item => <button type="button" key={item.id} className={persona === item.id ? "is-active" : ""} onClick={() => { setPersona(item.id); setNotice(""); }}><UserRound/><span><strong>{item.name}</strong><small>{item.classId ? `Turma ${item.classId} · ${item.detail}` : item.detail}</small></span></button>)}</div></div><label><Clock3/><span><strong>Momento simulado</strong><small>Não altera datas reais</small></span><select value={phase} onChange={event => setPhase(event.target.value as Phase)}>{Object.entries(phaseLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></section>
    {isAdmin ? <AdminSimulation decisions={decisions} counts={counts} /> : <StudentSimulation selected={selected} decision={currentDecision!} locked={locked} beforeOpen={beforeOpen} closed={closed} phase={phase} notice={notice} update={update} save={save} />}
  </AppShell>;
}

function AdminSimulation({ decisions, counts }: { decisions: typeof initial; counts: {stays:number;moves:number} }) {
  return <><section className="page-heading page-heading--simple"><div><span className="eyebrow">Painel administrativo fictício</span><h1>Ensaio do processo de turmas</h1><p>Confirma o comportamento do site antes de o utilizar com dados reais.</p></div></section>
    <section className="stats-grid test-stats"><article className="stat-card"><span className="stat-card__icon stat-card__icon--blue"><Users/></span><div><span>Turmas de teste</span><strong>5</strong><small>124 alunos simulados</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--green"><Check/></span><div><span>Permanecem</span><strong>{counts.stays}</strong><small>nos perfis de demonstração</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--ink"><RefreshCcw/></span><div><span>Pretendem mudar</span><strong>{counts.moves}</strong><small>nos perfis de demonstração</small></div></article></section>
    <section className="panel test-windows"><div className="panel__header"><div><h2>Prazos fictícios inseridos</h2><p>Dois blocos independentes para testar a abertura cumulativa.</p></div></div><div><article><Clock3/><span><strong>Turmas 1–2</strong><small>15 jul. 2026, 09:00 → 17 jul. 2026, 20:00</small></span></article><article><Clock3/><span><strong>Turmas 3–5</strong><small>16 jul. 2026, 09:00 → 18 jul. 2026, 20:00</small></span></article></div></section>
    <section className="panel"><div className="panel__header"><div><h2>Cinco turmas fictícias</h2><p>Dados isolados para navegação e verificação visual.</p></div></div><div className="table-scroll"><table><thead><tr><th>Turma</th><th>Representante fictício</th><th>Alunos</th><th>Perfis de teste</th><th>Estado</th></tr></thead><tbody>{classes.map(item => { const profiles = personas.filter(person => person.classId === item.id); return <tr key={item.id}><td><strong>Turma {item.id}</strong></td><td>{item.representative}</td><td>{item.students}</td><td>{profiles.length ? profiles.map(profile => profile.name).join(", ") : "—"}</td><td><span className="status status--neutral">Submetida</span></td></tr>; })}</tbody></table></div></section>
    <section className="panel test-decisions"><div className="panel__header"><div><h2>Decisões dos alunos fictícios</h2><p>Alterna de utilizador na barra superior para alterar cada cenário.</p></div></div>{Object.entries(decisions).map(([id,decision]) => { const person=personas.find(item=>item.id===id)!; return <article key={id}><UserRound/><span><strong>{person.name} · Turma {person.classId}</strong><small>{decision.destinations.length ? `Pretende mudar: ${decision.destinations.map(value=>`Turma ${value}`).join(" → ")}` : "Pretende permanecer na turma"}</small></span><b>{decision.saved ? "Guardado" : "Por guardar"}</b></article>; })}</section></>;
}

function StudentSimulation({ selected, decision, locked, beforeOpen, closed, phase, notice, update, save }: { selected: typeof personas[number]; decision: Decision; locked:boolean; beforeOpen:boolean; closed:boolean; phase:Phase; notice:string; update:(values:number[])=>void; save:()=>void }) {
  const moving=decision.destinations.length>0, alternatives=classes.map(item=>item.id).filter(id=>id!==selected.classId);
  return <><section className="test-student-heading"><span className="eyebrow">Vista do aluno fictício</span><h1>Olá, {selected.name}</h1><p>Estás na Turma {selected.classId}. Momento: {phaseLabels[phase]}.</p></section>
    {locked && <section className="test-access-blocked" role="status"><LockKeyhole/><div><strong>{beforeOpen ? "O período de acesso da tua turma ainda não começou." : closed ? "O período de acesso da tua turma já terminou." : "Acesso indisponível."}</strong><span>{beforeOpen ? `Aguarda pela abertura do bloco que inclui a Turma ${selected.classId}.` : "As preferências guardadas já não podem ser alteradas."}</span></div></section>}
    <section className={`student-preferences test-preferences${locked?" is-locked":""}`}><header><div><span className="eyebrow">A tua colocação</span><h2>Turma {selected.classId} · preferências</h2><p>{(selected.classId||0)<=2 ? "Bloco Turmas 1–2" : "Bloco Turmas 3–5"}</p></div><span className={`preference-state ${locked?"is-locked":moving?"is-move":"is-stay"}`}>{locked?"Acesso bloqueado":moving?"Pretendes mudar":"Permaneces na turma"}</span></header><div className="student-preferences__body"><div className="student-preferences__choice-column"><div className="student-preferences__choice"><button type="button" className={!moving?"is-active":""} disabled={locked} onClick={()=>update([])}><Check/>Ficar na Turma {selected.classId}</button><button type="button" className={moving?"is-active":""} disabled={locked} onClick={()=>update([alternatives[0]])}>Indicar alternativas</button></div></div>{moving&&<div className="student-preferences__ranking"><strong>Ordem de preferência</strong>{decision.destinations.map((destination,index)=><div className="preference-destination" key={index}><div className="student-preferences__row"><span>{index+1}.ª</span><select disabled={locked} value={destination} onChange={event=>update(decision.destinations.map((value,i)=>i===index?Number(event.target.value):value))}>{alternatives.filter(id=>!decision.destinations.includes(id)||id===destination).map(id=><option key={id} value={id}>Turma {id}</option>)}</select><button type="button" disabled={locked} onClick={()=>update(decision.destinations.filter((_,i)=>i!==index))}>Remover</button></div></div>)}<button className="add-preference" type="button" disabled={locked||decision.destinations.length>=alternatives.length} onClick={()=>update([...decision.destinations,alternatives.find(id=>!decision.destinations.includes(id))!])}>Acrescentar alternativa</button></div>}</div><footer>{notice&&<p role="status">{notice}</p>}<span className="test-safety"><ShieldCheck/>Dados apenas de teste</span><button type="button" className="button button--primary" disabled={locked||decision.saved} onClick={save}><Save/>{decision.saved?"Preferências guardadas":"Guardar preferências"}</button></footer></section></>;
}
