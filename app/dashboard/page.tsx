import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";
import { PersonalDashboard } from "@/components/personal-dashboard";

export default function DashboardPage() {
  return <AuthGuard><ModuleGuard moduleKey="dashboard.personal"><PersonalDashboard /></ModuleGuard></AuthGuard>;
}
