import { AuthGuard } from "@/components/auth-guard";
import { CurricularUnitAcademicContentManagement } from "@/components/curricular-unit-academic-content-management";
import { ModuleGuard } from "@/components/module-guard";

export default async function CurricularUnitAcademicContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuthGuard requireAdmin><ModuleGuard moduleKey="curricular_units.content.management"><CurricularUnitAcademicContentManagement id={id} /></ModuleGuard></AuthGuard>;
}
