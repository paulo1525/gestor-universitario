import { AdminControl } from "@/components/admin-control";
import { AuthGuard } from "@/components/auth-guard";

export default function AdminPage() { return <AuthGuard requireAdmin><AdminControl /></AuthGuard>; }
