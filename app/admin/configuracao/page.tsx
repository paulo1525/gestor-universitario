import { AdminControl } from "@/components/admin-control";
import { AuthGuard } from "@/components/auth-guard";

export default function AdminSettingsPage() {
  return <AuthGuard requireAdmin><AdminControl view="settings" /></AuthGuard>;
}
