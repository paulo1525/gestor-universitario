import { PersonalDashboard } from "@/components/personal-dashboard";
import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";

export default function Home() {
  return <AuthGuard><ModuleGuard moduleKey="dashboard.personal"><PersonalDashboard /></ModuleGuard></AuthGuard>;
}
