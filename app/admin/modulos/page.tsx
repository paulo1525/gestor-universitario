import { AuthGuard } from "@/components/auth-guard";
import { ModuleManagementPage } from "@/components/module-management-page";

export default function ModulesPage() {
  return <AuthGuard requireAdmin><ModuleManagementPage /></AuthGuard>;
}
