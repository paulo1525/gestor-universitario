import { getCloudflareContext } from "@opennextjs/cloudflare";
import { completedQuizStatistics, type QuizProgressPayload } from "@/lib/quiz-progress-statistics.mjs";
import authWorker, { type Env } from "@/worker/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function workerResponse(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return authWorker.fetch(request, env as unknown as Env);
}

async function getProgress(request: Request): Promise<Response> {
  const response = await workerResponse(request);
  if (!response.ok) return response;

  let payload: QuizProgressPayload;
  try {
    payload = await response.clone().json() as QuizProgressPayload;
  } catch {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(completedQuizStatistics(payload)), { status: response.status, headers });
}

export { getProgress as GET, workerResponse as DELETE };
