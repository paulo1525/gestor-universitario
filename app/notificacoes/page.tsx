import { AuthGuard } from "@/components/auth-guard";
import { NotificationsCenter } from "@/components/notifications-center";
import { ModuleGuard } from "@/components/module-guard";

export default function NotificationsPage() {
  return <AuthGuard><ModuleGuard moduleKey="notifications.feed"><NotificationsCenter /></ModuleGuard></AuthGuard>;
}
