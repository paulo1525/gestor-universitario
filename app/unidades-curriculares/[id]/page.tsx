import { CurricularUnitDetail } from "@/components/curricular-unit-catalog";
export default async function CurricularUnitPage({params}:{params:Promise<{id:string}>}){const{id}=await params;return <CurricularUnitDetail id={id}/>;}
