import { AuthGuard } from "@/components/auth-guard";
import { HomeModuleGuard } from "@/components/module-guard";
import { TurmasDashboard } from "@/components/turmas-dashboard";

export default function ClassesPage() {
  return <AuthGuard><HomeModuleGuard><TurmasDashboard /></HomeModuleGuard></AuthGuard>;
}
