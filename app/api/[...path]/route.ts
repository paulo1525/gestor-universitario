import { getCloudflareContext } from "@opennextjs/cloudflare";
import authWorker, { type Env } from "@/worker/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return authWorker.fetch(request, env as unknown as Env);
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
