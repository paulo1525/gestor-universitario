import { AuthGuard } from "@/components/auth-guard";
import { CurricularUnitsManagement } from "@/components/curricular-units-management";
import { ModuleGuard } from "@/components/module-guard";

export default function CurricularUnitsPage() {
  return <AuthGuard requireAdmin><ModuleGuard moduleKey="curricular_units.catalog"><CurricularUnitsManagement /></ModuleGuard></AuthGuard>;
}
