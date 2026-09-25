/**
 * PDFs of the annotator kept on this device (Cache Storage), so reopening a large book excerpt is instant.
 * Every open still asks the server with If-None-Match: 304 means the cached copy is current, 200 replaces it.
 * Without Cache Storage (private windows, old browsers) it simply downloads, still reporting progress.
 */

const CACHE_NAME = "gu-pdf-v1";
const MAX_ENTRIES = 16;
const CACHED_AT = "x-gu-cached-at";

export type PdfLoadProgress = { phase: "checking" | "downloading" | "cached"; loaded: number; total: number | null };

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** Reads a response body chunk by chunk, reporting bytes received. */
async function readWithProgress(response: Response, onProgress: (progress: PdfLoadProgress) => void, signal?: AbortSignal): Promise<Uint8Array> {
  const total = Number(response.headers.get("content-length")) || null;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress({ phase: "downloading", loaded: bytes.length, total: bytes.length });
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress({ phase: "downloading", loaded, total });
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new DOMException("Aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ phase: "downloading", loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Keeps the most recently opened documents only. */
async function trim(cache: Cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const dated = await Promise.all(keys.map(async (request) => ({ request, at: Number((await cache.match(request))?.headers.get(CACHED_AT)) || 0 })));
  dated.sort((a, b) => a.at - b.at);
  await Promise.all(dated.slice(0, keys.length - MAX_ENTRIES).map((entry) => cache.delete(entry.request)));
}

export async function loadPdfBytes(url: string, onProgress: (progress: PdfLoadProgress) => void, signal?: AbortSignal): Promise<Uint8Array> {
  const cache = await openCache();
  const cached = cache ? await cache.match(url).catch(() => undefined) : undefined;
  const etag = cached?.headers.get("etag");
  onProgress({ phase: "checking", loaded: 0, total: null });
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", cache: "no-cache", signal, headers: etag ? { "if-none-match": etag } : undefined });
  } catch (reason) {
    // Offline or the server is unreachable: a cached copy is better than nothing.
    if (cached && !signal?.aborted) {
      const bytes = new Uint8Array(await cached.arrayBuffer());
      onProgress({ phase: "cached", loaded: bytes.length, total: bytes.length });
      return bytes;
    }
    throw reason;
  }
  if (response.status === 304 && cached) {
    const bytes = new Uint8Array(await cached.arrayBuffer());
    onProgress({ phase: "cached", loaded: bytes.length, total: bytes.length });
    return bytes;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || "Não foi possível abrir o PDF.");
  }
  const bytes = await readWithProgress(response, onProgress, signal);
  if (cache && response.headers.get("etag")) {
    const headers = new Headers({ "content-type": "application/pdf", etag: String(response.headers.get("etag")), [CACHED_AT]: String(Date.now()) });
    // pdf.js may transfer the buffer it receives, so the cache gets its own copy.
    await cache.put(url, new Response(bytes.slice(), { headers })).then(() => trim(cache)).catch(() => undefined);
  }
  return bytes;
}
