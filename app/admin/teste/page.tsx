import { AuthGuard } from "@/components/auth-guard";
import { TestEnvironment } from "@/components/test-environment";

export default function TestPage() {
  return <AuthGuard requireAdmin><TestEnvironment /></AuthGuard>;
}
