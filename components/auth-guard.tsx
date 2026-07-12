"use client";
import {ReactNode,useEffect,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import {ShieldCheck} from "lucide-react";
import {useAuth} from "@/components/auth-context";
type AccessConfig={maintenance:boolean;formationActive:boolean};
let cached:AccessConfig|null=null,request:Promise<AccessConfig>|null=null;
function accessConfig(){if(cached)return Promise.resolve(cached);request??=fetch("/api/config",{cache:"no-store"}).then(async response=>await response.json() as {maintenanceMode?:boolean;closeAt?:string;serverNow?:number}).then(config=>({maintenance:config.maintenanceMode===true,formationActive:Number(config.serverNow||Date.now())<Date.parse(config.closeAt||"")})).catch(()=>({maintenance:true,formationActive:false})).then(value=>(cached=value));return request}
export function AccessDenied(){
 const router=useRouter();
 useEffect(()=>{const timer=window.setTimeout(()=>router.replace("/"),3000);return()=>window.clearTimeout(timer)},[router]);
 return <main className="auth-loading auth-loading--denied" role="alert"><ShieldCheck size={28}/><div><strong>Sem permissão para visualizar esta página.</strong><span>A redirecionar para o início em 3 segundos…</span></div></main>;
}
export function AuthGuard({children,allowDuringMaintenance=false,requireAdmin=false}:{children:ReactNode;allowDuringMaintenance?:boolean;requireAdmin?:boolean}){
 const {user,loading}=useAuth(),[access,setAccess]=useState<AccessConfig|null>(()=>cached),pathname=usePathname(),router=useRouter();
 useEffect(()=>{if(!loading&&!user)router.replace(`/login?next=${encodeURIComponent(pathname)}`)},[loading,user,pathname,router]);
 useEffect(()=>{void accessConfig().then(setAccess)},[]);
 const roleBlocked=Boolean(requireAdmin&&user&&user.role!=="admin");
 const maintenanceBlocked=Boolean(!roleBlocked&&access?.maintenance&&user?.role!=="admin"&&!user?.preview&&!allowDuringMaintenance),formationBlocked=Boolean(!roleBlocked&&access?.formationActive&&user?.role==="student"&&!user?.classRepresentative&&!user?.preview&&!allowDuringMaintenance);
 useEffect(()=>{if(!loading&&user&&roleBlocked)return;if(!loading&&user&&maintenanceBlocked)router.replace("/manutencao/");else if(!loading&&user&&formationBlocked)router.replace("/formacao-em-curso/")},[loading,user,roleBlocked,maintenanceBlocked,formationBlocked,router]);
 if(roleBlocked)return <AccessDenied/>;
 if(loading||!user||!access||maintenanceBlocked||formationBlocked)return <main className="auth-loading"><ShieldCheck size={28}/><strong>A validar a sessão segura…</strong></main>;
 return children;
}
