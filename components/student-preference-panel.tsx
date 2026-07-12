/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, CircleHelp, LockKeyhole, Plus, Save, Trash2 } from "lucide-react";

type Consideration = "with_person" | "integration_bullying" | "other_exception";
type Friend = { id: string; fullName: string; studentNumber: string; classId: number; preference?: "stay" | "move" };
type PreferenceData = { student: { classId: number; notes: string; destinations: number[]; considerations: Consideration[]; friends: Friend[] }; activeClasses: number[]; settings: { preferencesOpenAt?: string; preferencesCloseAt?: string }; serverNow: number };

const options: Array<{ value: Consideration; label: string; sensitive?: boolean }> = [
  { value: "with_person", label: "Quero estar com uma ou mais pessoas específicas" },
  { value: "integration_bullying", label: "Tenho dificuldades graves de integração ou sofro bullying", sensitive: true },
  { value: "other_exception", label: "Existe outra situação excecional que deve ser analisada", sensitive: true },
];

const helpContent = {
  overview: { title: "Como preencher", body: "Escolhe primeiro se queres ficar ou mudar. Se indicares alternativas, ordena as turmas pela tua preferência e, no fim, guarda o formulário." },
  decision: { title: "Ficar ou mudar", body: "Seleciona Ficar para manteres a tua turma atual. Seleciona Indicar alternativas apenas se quiseres concorrer a outra turma." },
  ranking: { title: "Ordem das turmas", body: "A primeira turma da lista é a tua primeira opção. As opções seguintes só são consideradas se não for possível colocar-te numa opção anterior." },
  situations: { title: "Situações a considerar", body: "Seleciona apenas as situações que se aplicam ao teu caso. As opções sensíveis e a informação adicional podem exigir análise manual." },
  people: { title: "Pessoas específicas", body: "Podes indicar até 6 pessoas. A primeira pessoa da lista é a tua prioridade mais alta; as seguintes ficam por ordem decrescente de prioridade. A colocação depende sempre das vagas e do equilíbrio das turmas." },
} as const;
type HelpTopic = keyof typeof helpContent;

export function StudentPreferencePanel() {
  const [data, setData] = useState<PreferenceData | null>(null);
  const [destinations, setDestinations] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [considerations, setConsiderations] = useState<Consideration[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/student/destinations", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as PreferenceData;
    setData(result);
    setDestinations(result.student.destinations);
    setNotes(result.student.notes);
    setConsiderations(result.student.considerations || []);
    setFriends(result.student.friends || []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const preferencesClosed = Boolean(data?.settings.preferencesCloseAt && data.serverNow >= Date.parse(data.settings.preferencesCloseAt));

  useEffect(() => {
    if (preferencesClosed || query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/student/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const result = await response.json() as { students?: Friend[] };
        setResults((result.students || []).filter((item) => !friends.some((friend) => friend.id === item.id)));
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, friends, preferencesClosed]);

  if (!data) return null;
  const alternatives = data.activeClasses.filter((id) => id !== data.student.classId);
  const moving = destinations.length > 0;
  const sensitive = considerations.some((value) => options.find((option) => option.value === value)?.sensitive);
  const withFriends = considerations.includes("with_person");
  const update = (index: number, value: number) => setDestinations((current) => current.map((item, i) => i === index ? value : item));
  const shift = (index: number, direction: -1 | 1) => setDestinations((current) => current.map((value, i) => i === index + direction ? current[index] : i === index ? current[index + direction] : value));
  const toggle = (value: Consideration) => setConsiderations((current) => { if (current.includes(value)) { if (value === "with_person") setFriends([]); return current.filter((item) => item !== value); } return [...current, value]; });
  const stay = () => { setDestinations([]); setConsiderations([]); setFriends([]); setNotes(""); };
  const chooseFriend = (friend: Friend) => { if (friends.length >= 6) return setNotice("Podes selecionar no máximo seis colegas."); setFriends((current) => [...current, friend]); setQuery(""); setResults([]); };
  const helpButton = (topic: HelpTopic, label: string) => <button type="button" className="preference-help-button" aria-expanded={helpTopic === topic} aria-controls={`preference-help-${topic}`} onClick={() => setHelpTopic((current) => current === topic ? null : topic)}><CircleHelp size={15} />{label}</button>;
  const helpPanel = (topic: HelpTopic) => helpTopic === topic && <div id={`preference-help-${topic}`} className="preference-help" role="region"><strong>{helpContent[topic].title}</strong><span>{helpContent[topic].body}</span></div>;

  async function save() {
    if (preferencesClosed) return;
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/student/destinations", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ destinations, notes: sensitive ? notes : "", considerations: moving ? considerations : [], friends: withFriends ? friends.map((friend) => ({ studentId: friend.id })) : [] }) });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? "Preferências guardadas com sucesso." : result.error || "Não foi possível guardar.");
    setSaving(false);
  }

  return <section className={`student-preferences${preferencesClosed ? " is-locked" : ""}`} aria-labelledby="student-preferences-title">
    <header><div><span className="eyebrow">A tua colocação</span><h2 id="student-preferences-title">Turma {data.student.classId} · preferências</h2><p>Escolhe primeiro se pretendes permanecer ou indicar alternativas.</p></div><div className="student-preferences__header-actions">{helpButton("overview", "Como preencher?")}<span className={`preference-state ${preferencesClosed ? "is-locked" : moving ? "is-move" : "is-stay"}`}>{preferencesClosed ? "Prazo encerrado" : moving ? "Pretendes mudar" : "Permaneces na turma"}</span></div></header>
    {helpPanel("overview")}
    {preferencesClosed && <div className="student-preferences__deadline-closed" role="status"><LockKeyhole size={17} /><span><strong>Prazo encerrado</strong><small>As tuas preferências estão bloqueadas e são apresentadas exatamente como foram submetidas.</small></span></div>}
    <div className="student-preferences__body">
      <div className="student-preferences__choice-column"><div className="student-preferences__choice"><button type="button" className={!moving ? "is-active" : ""} disabled={preferencesClosed} onClick={stay}><Check />Ficar na Turma {data.student.classId}</button><button type="button" className={moving ? "is-active" : ""} disabled={preferencesClosed} onClick={() => setDestinations((current) => current.length ? current : [alternatives[0]])}>Indicar alternativas</button></div>{helpButton("decision", "Qual devo escolher?")}{helpPanel("decision")}</div>
      {!moving && <aside className="preference-side-guide"><span className="preference-side-guide__icon"><Check /></span><div><strong>Permaneces na tua turma</strong><p>A tua colocação atual fica mantida e não precisas de indicar alternativas.</p></div></aside>}
      {moving && <div className="student-preferences__ranking"><div className="preference-intro"><strong>Ordem de preferência</strong><div><span>Sem vaga válida, permaneces na Turma {data.student.classId}, salvo decisão manual excecional.</span>{helpButton("ranking", "Como ordenar?")}</div></div>{helpPanel("ranking")}{destinations.map((destination, index) => <div className="student-preferences__row" key={`${destination}-${index}`}><span>{index + 1}.ª</span><select value={destination} aria-label={`${index + 1}.ª preferência`} disabled={preferencesClosed} onChange={(event) => update(index, Number(event.target.value))}>{alternatives.filter((id) => !destinations.includes(id) || id === destination).map((id) => <option key={id} value={id}>Turma {id}</option>)}</select><div><button type="button" aria-label="Subir preferência" disabled={preferencesClosed || !index} onClick={() => shift(index, -1)}><ArrowUp /></button><button type="button" aria-label="Descer preferência" disabled={preferencesClosed || index === destinations.length - 1} onClick={() => shift(index, 1)}><ArrowDown /></button><button type="button" aria-label="Remover preferência" disabled={preferencesClosed} onClick={() => setDestinations((current) => current.filter((_, i) => i !== index))}><Trash2 /></button></div></div>)}<button type="button" className="add-preference" disabled={preferencesClosed || destinations.length >= alternatives.length} onClick={() => setDestinations((current) => [...current, alternatives.find((id) => !current.includes(id))!])}><Plus />Acrescentar alternativa</button></div>}
      {moving && <fieldset className="student-considerations" disabled={preferencesClosed}><legend><span>Situações a considerar <small>Podes selecionar uma ou várias opções</small></span>{helpButton("situations", "O que devo indicar?")}</legend><div>{options.map((option) => <label key={option.value} className={considerations.includes(option.value) ? "is-selected" : ""}><input type="checkbox" checked={considerations.includes(option.value)} onChange={() => toggle(option.value)} /><span>{option.label}</span></label>)}</div>{helpPanel("situations")}{sensitive && <label className="student-preferences__notes"><span>Informação adicional <small>Partilha apenas o indispensável para a análise manual</small></span><textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Explica de forma breve a situação selecionada." /></label>}</fieldset>}
      {moving && withFriends && <section className="friend-picker"><div className="friend-picker__intro"><div><strong>Com quem queres ficar?</strong><span>Podes indicar até 6 pessoas.</span></div>{helpButton("people", "Como funciona?")}{helpPanel("people")}</div><div className="friend-picker__search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Escreve o nome da pessoa…" disabled={preferencesClosed || friends.length >= 6} />{searching && <small>A procurar…</small>}{results.length > 0 && <div className="friend-picker__results">{results.map((friend) => <button type="button" key={friend.id} disabled={preferencesClosed} onClick={() => chooseFriend(friend)}><strong>{friend.fullName}</strong><span>{friend.studentNumber} · Turma {friend.classId}</span></button>)}</div>}</div>{friends.length > 0 && <div className="friend-picker__selected">{friends.map((friend) => <article key={friend.id}><div><strong>{friend.fullName}</strong><span>{friend.studentNumber} · Turma {friend.classId}</span></div><button type="button" aria-label={`Remover ${friend.fullName}`} disabled={preferencesClosed} onClick={() => setFriends((current) => current.filter((item) => item.id !== friend.id))}><Trash2 /></button></article>)}</div>}</section>}
    </div><footer>{notice && <p role="status">{notice}</p>}<button type="button" className="button button--primary" onClick={() => void save()} disabled={preferencesClosed || saving}><Save />{saving ? "A guardar…" : preferencesClosed ? "Preferências bloqueadas" : "Guardar preferências"}</button></footer>
  </section>;
}
