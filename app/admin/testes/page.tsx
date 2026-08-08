import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";
import { QuizManagement } from "@/components/quiz-management";

export default function QuizManagementPage() {
  return <AuthGuard requireAdmin><ModuleGuard moduleKey="quizzes.management"><QuizManagement /></ModuleGuard></AuthGuard>;
}
