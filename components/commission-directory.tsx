"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, BookOpenCheck, BriefcaseBusiness, GraduationCap, LoaderCircle, Mail, Search, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/commission-directory.module.css";

type ApiMember = { id:string|number; email:string; fullName?:string; full_name?:string; commissionPositionLabel?:string|null; commission_position_label?:string|null; commissionPosition?:string|null; commission_position?:string|null; commissionDepartment?:string|null; commission_department?:string|null; representedClass?:number|null; represented_class?:number|null; units?:Array<{id:string|number;code?:string;name?:string}>; curricularUnits?:Array<{id:string|number;code?:string;name?:string}> };
type Member = { id:string; email:string; name:string; position:string; department:string; representedClass:number|null; units:Array<{id:string;code:string;name:string}> };

const departmentLabelKeys={management:"community.directory.department.management",students:"community.directory.department.students",faculty:"community.directory.department.faculty",commission:"community.directory.department.commission"} as const;
function normalize(item:ApiMember,defaultPosition:string,defaultUnit:string):Member{return{id:String(item.id),email:item.email,name:item.fullName??item.full_name??item.email,position:item.commissionPositionLabel??item.commission_position_label??item.commissionPosition??item.commission_position??defaultPosition,department:item.commissionDepartment??item.commission_department??"commission",representedClass:item.representedClass??item.represented_class??null,units:(item.units??item.curricularUnits??[]).map(unit=>({id:String(unit.id),code:unit.code??"UC",name:unit.name??defaultUnit}))};}

export function CommissionDirectory(){
  const {locale,t}=useI18n();
  const [members,setMembers]=useState<Member[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[query,setQuery]=useState(""),[department,setDepartment]=useState("all");
  const departmentLabel=useCallback((value:string)=>{const key=departmentLabelKeys[value as keyof typeof departmentLabelKeys];return key?t(key):value.replaceAll("_"," ").replace(/^./,letter=>letter.toLocaleUpperCase(locale));},[locale,t]);
  const load=useCallback(async()=>{setLoading(true);setError("");try{const response=await fetch("/api/commission-directory",{cache:"no-store"});const data=await response.json() as {members?:ApiMember[];representatives?:ApiMember[];error?:string};if(!response.ok)throw new Error(data.error||t("community.directory.loadError"));setMembers((data.members??data.representatives??[]).map(item=>normalize(item,t("community.directory.defaultPosition"),t("community.common.curricularUnit"))));}catch(reason){setError(reason instanceof Error?reason.message:t("community.directory.loadError"));}finally{setLoading(false)}},[t]);
  useEffect(()=>{void load()},[load]);
  const departments=useMemo(()=>Array.from(new Set(members.map(member=>member.department))).sort((a,b)=>departmentLabel(a).localeCompare(departmentLabel(b),locale)),[departmentLabel,locale,members]);
  const unitCount=useMemo(()=>new Set(members.flatMap(member=>member.units.map(unit=>unit.id))).size,[members]);
  const visible=useMemo(()=>{const term=query.trim().toLocaleLowerCase(locale);return members.filter(member=>(department==="all"||member.department===department)&&(!term||[member.name,member.email,member.position,departmentLabel(member.department),...member.units.flatMap(unit=>[unit.code,unit.name])].some(value=>value.toLocaleLowerCase(locale).includes(term))));},[department,departmentLabel,locale,members,query]);
  const clearFilters=()=>{setQuery("");setDepartment("all")};

  return <AuthGuard><ModuleGuard moduleKey="directory.members"><AppShell active="directory" breadcrumb={t("community.directory.breadcrumb")}><div className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.heroIcon}><Users/></span><div><span className="eyebrow">{t("community.directory.eyebrow")}</span><h1>{t("community.directory.breadcrumb")}</h1><p>{t("community.directory.description")}</p></div></div>
      <div className={styles.metrics} aria-label={t("community.directory.summary")}><div><strong>{members.length}</strong><span>{t("community.directory.members")}</span></div><div><strong>{departments.length}</strong><span>{t("community.directory.departments")}</span></div><div><strong>{unitCount}</strong><span>{t("community.directory.units")}</span></div></div>
    </header>
    {error&&<AppToast kind="error" message={error} duration={0} onDismiss={()=>setError("")}/>}
    <section className={styles.directory} aria-labelledby="diretorio-titulo">
      <header className={styles.directoryHeader}><div><span className={styles.sectionIcon}><BadgeCheck/></span><div><h2 id="diretorio-titulo">{t("community.directory.title")}</h2><p>{t("community.directory.sync")}</p></div></div>{!loading&&<span className={styles.count}>{visible.length} {visible.length===1?t("community.directory.member"):t("community.directory.memberPlural")}</span>}</header>
      <div className={styles.controls}>
        <label className={styles.search}><Search/><span className="sr-only">{t("community.directory.search")}</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={t("community.directory.searchPlaceholder")}/></label>
        <div className={styles.departmentTabs} role="group" aria-label={t("community.directory.filter")}><button type="button" className={department==="all"?styles.activeTab:""} onClick={()=>setDepartment("all")}>{t("community.directory.all")}</button>{departments.map(value=><button type="button" className={department===value?styles.activeTab:""} onClick={()=>setDepartment(value)} key={value}>{departmentLabel(value)}</button>)}</div>
      </div>
      {loading?<div className={styles.state}><LoaderCircle className={styles.spin}/><strong>{t("community.directory.loading")}</strong></div>:visible.length===0?<div className={styles.state}><Search/><strong>{t("community.directory.empty")}</strong><p>{t("community.directory.emptyHint")}</p><button className="button" type="button" onClick={clearFilters}>{t("community.directory.clear")}</button></div>:<div className={styles.grid}>{visible.map(member=><article className={styles.card} key={member.id}>
        <div className={styles.cardIdentity}><span className={styles.avatar}>{member.name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase()}</span><div><span className={styles.position}>{member.position}</span><h3>{member.name}</h3><p><BriefcaseBusiness/>{departmentLabel(member.department)}</p></div></div>
        <a className={styles.email} href={`mailto:${member.email}`}><Mail/><span>{member.email}</span></a>
        {member.representedClass&&<div className={styles.classRole}><GraduationCap/><span>{t("community.directory.classRepresentative",{class:member.representedClass})}</span></div>}
        <div className={styles.units}><div><BookOpenCheck/><strong>{t("community.directory.followedUnits")}</strong><span>{member.units.length}</span></div>{member.units.length?<div className={styles.unitList}>{member.units.map(unit=><span title={unit.name} key={unit.id}><b>{unit.code}</b>{unit.name}</span>)}</div>:<p>{t("community.directory.noUnit")}</p>}</div>
      </article>)}</div>}
    </section>
  </div></AppShell></ModuleGuard></AuthGuard>;
}
