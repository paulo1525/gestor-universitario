import { AdminConsoleHome } from "@/components/admin-console-home";
import { AuthGuard } from "@/components/auth-guard";

export default function AdminPage() {
  return <AuthGuard requireAdmin><AdminConsoleHome /></AuthGuard>;
}
