import { TurmasDashboard } from "@/components/turmas-dashboard";
import { AuthGuard } from "@/components/auth-guard";
import { HomeModuleGuard } from "@/components/module-guard";

export default function Home() {
  return <AuthGuard><HomeModuleGuard><TurmasDashboard /></HomeModuleGuard></AuthGuard>;
}
