"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, BookOpenCheck, BriefcaseBusiness, GraduationCap, LoaderCircle, Mail, Search, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";
import styles from "@/components/commission-directory.module.css";

type ApiMember = { id:string|number; email:string; fullName?:string; full_name?:string; commissionPositionLabel?:string|null; commission_position_label?:string|null; commissionPosition?:string|null; commission_position?:string|null; commissionDepartment?:string|null; commission_department?:string|null; representedClass?:number|null; represented_class?:number|null; units?:Array<{id:string|number;code?:string;name?:string}>; curricularUnits?:Array<{id:string|number;code?:string;name?:string}> };
type Member = { id:string; email:string; name:string; position:string; department:string; representedClass:number|null; units:Array<{id:string;code:string;name:string}> };

const departmentNames:Record<string,string>={management:"Núcleo de gestão",students:"Representantes dos estudantes",faculty:"Representantes docentes",commission:"Comissão de Curso"};
function departmentLabel(value:string){return departmentNames[value]??value.replaceAll("_"," ").replace(/^./,letter=>letter.toLocaleUpperCase("pt-PT"));}
function normalize(item:ApiMember):Member{return{id:String(item.id),email:item.email,name:item.fullName??item.full_name??item.email,position:item.commissionPositionLabel??item.commission_position_label??item.commissionPosition??item.commission_position??"Membro da Comissão de Curso",department:item.commissionDepartment??item.commission_department??"commission",representedClass:item.representedClass??item.represented_class??null,units:(item.units??item.curricularUnits??[]).map(unit=>({id:String(unit.id),code:unit.code??"UC",name:unit.name??"Unidade curricular"}))};}

export function CommissionDirectory(){
  const [members,setMembers]=useState<Member[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[query,setQuery]=useState(""),[department,setDepartment]=useState("all");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const response=await fetch("/api/commission-directory",{cache:"no-store"});const data=await response.json() as {members?:ApiMember[];representatives?:ApiMember[];error?:string};if(!response.ok)throw new Error(data.error||"Não foi possível carregar os representantes.");setMembers((data.members??data.representatives??[]).map(normalize));}catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível carregar os representantes.");}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  const departments=useMemo(()=>Array.from(new Set(members.map(member=>member.department))).sort((a,b)=>departmentLabel(a).localeCompare(departmentLabel(b),"pt-PT")),[members]);
  const unitCount=useMemo(()=>new Set(members.flatMap(member=>member.units.map(unit=>unit.id))).size,[members]);
  const visible=useMemo(()=>{const term=query.trim().toLocaleLowerCase("pt-PT");return members.filter(member=>(department==="all"||member.department===department)&&(!term||[member.name,member.email,member.position,departmentLabel(member.department),...member.units.flatMap(unit=>[unit.code,unit.name])].some(value=>value.toLocaleLowerCase("pt-PT").includes(term))));},[members,query,department]);
  const clearFilters=()=>{setQuery("");setDepartment("all")};

  return <AuthGuard><ModuleGuard moduleKey="directory.members"><AppShell active="directory" breadcrumb="Comissão de Curso"><div className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.heroIcon}><Users/></span><div><span className="eyebrow">Pessoas, funções e contactos</span><h1>Comissão de Curso</h1><p>Conhece quem representa a comunidade académica, as responsabilidades de cada membro e as unidades curriculares que acompanha.</p></div></div>
      <div className={styles.metrics} aria-label="Resumo da Comissão de Curso"><div><strong>{members.length}</strong><span>Membros</span></div><div><strong>{departments.length}</strong><span>Núcleos</span></div><div><strong>{unitCount}</strong><span>UC acompanhadas</span></div></div>
    </header>
    {error&&<AppToast kind="error" message={error} duration={0} onDismiss={()=>setError("")}/>}
    <section className={styles.directory} aria-labelledby="diretorio-titulo">
      <header className={styles.directoryHeader}><div><span className={styles.sectionIcon}><BadgeCheck/></span><div><h2 id="diretorio-titulo">Diretório da Comissão</h2><p>Informação sincronizada com os perfis institucionais.</p></div></div>{!loading&&<span className={styles.count}>{visible.length} {visible.length===1?"membro":"membros"}</span>}</header>
      <div className={styles.controls}>
        <label className={styles.search}><Search/><span className="sr-only">Pesquisar membro</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Pesquisar por nome, cargo, email ou unidade curricular…"/></label>
        <div className={styles.departmentTabs} role="group" aria-label="Filtrar por núcleo"><button type="button" className={department==="all"?styles.activeTab:""} onClick={()=>setDepartment("all")}>Todos</button>{departments.map(value=><button type="button" className={department===value?styles.activeTab:""} onClick={()=>setDepartment(value)} key={value}>{departmentLabel(value)}</button>)}</div>
      </div>
      {loading?<div className={styles.state}><LoaderCircle className={styles.spin}/><strong>A sincronizar membros…</strong></div>:visible.length===0?<div className={styles.state}><Search/><strong>Nenhum membro corresponde à pesquisa.</strong><p>Experimenta remover os filtros ou pesquisar por outro termo.</p><button className="button" type="button" onClick={clearFilters}>Limpar filtros</button></div>:<div className={styles.grid}>{visible.map(member=><article className={styles.card} key={member.id}>
        <div className={styles.cardIdentity}><span className={styles.avatar}>{member.name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase()}</span><div><span className={styles.position}>{member.position}</span><h3>{member.name}</h3><p><BriefcaseBusiness/>{departmentLabel(member.department)}</p></div></div>
        <a className={styles.email} href={`mailto:${member.email}`}><Mail/><span>{member.email}</span></a>
        {member.representedClass&&<div className={styles.classRole}><GraduationCap/><span>Representante da Turma {member.representedClass}</span></div>}
        <div className={styles.units}><div><BookOpenCheck/><strong>Unidades acompanhadas</strong><span>{member.units.length}</span></div>{member.units.length?<div className={styles.unitList}>{member.units.map(unit=><span title={unit.name} key={unit.id}><b>{unit.code}</b>{unit.name}</span>)}</div>:<p>Sem unidade curricular atribuída.</p>}</div>
      </article>)}</div>}
    </section>
  </div></AppShell></ModuleGuard></AuthGuard>;
}
