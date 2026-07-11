import { TurmasDashboard } from "@/components/turmas-dashboard";
import { AuthGuard } from "@/components/auth-guard";

export default function Home() {
  return <AuthGuard><TurmasDashboard /></AuthGuard>;
}
