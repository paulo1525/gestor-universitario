/** Count an intentional opening. Analytics failure must never prevent access to a file. */
export async function trackMaterialView(id: string, type: "catalog" | "anki" = "catalog"): Promise<number | null> {
  try {
    const response = await fetch(`/api/material-views/${type}/${encodeURIComponent(id)}`, { method: "POST", credentials: "same-origin", keepalive: true });
    if (!response.ok) return null;
    const result = await response.json() as { views?: number };
    const views = typeof result.views === "number" && Number.isSafeInteger(result.views) && result.views >= 0 ? result.views : null;
    if (views !== null && typeof BroadcastChannel !== "undefined") {
      try { const channel = new BroadcastChannel("gu-material-views"); channel.postMessage({ id, type, views }); channel.close(); } catch { /* Optional cross-tab refresh. */ }
    }
    return views;
  } catch { return null; }
}

type ViewUpdate = { id: string; type: "catalog" | "anki"; views: number };
/** Refresh the originating list when the PDF opens in a separate tab. No polling or browser storage. */
export function subscribeMaterialViews(onUpdate: (update: ViewUpdate) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  try {
    const channel = new BroadcastChannel("gu-material-views");
    channel.onmessage = ({ data }) => {
      if (typeof data?.id === "string" && ["catalog", "anki"].includes(data.type) && Number.isSafeInteger(data.views) && data.views >= 0) onUpdate(data as ViewUpdate);
    };
    return () => channel.close();
  } catch { return () => {}; }
}
