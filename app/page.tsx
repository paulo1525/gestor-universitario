import { AuthGuard } from "@/components/auth-guard";
import { HomepageResolver } from "@/components/homepage-resolver";

export default function Home() {
  return <AuthGuard><HomepageResolver /></AuthGuard>;
}
