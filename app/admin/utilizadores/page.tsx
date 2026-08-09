import { AdminControl } from "@/components/admin-control";
import { AuthGuard } from "@/components/auth-guard";

export default function AdminUsersPage() {
  return <AuthGuard requireAdmin><AdminControl view="users" /></AuthGuard>;
}
