"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { MaterialPdfReader } from "@/components/material-pdf-reader";
import { QuietLoading } from "@/components/quiet-loading";
import styles from "@/components/material-pdf-reader.module.css";

type ReaderItem = { id: string; title: string; unitCode?: string | null; viewUrl?: string | null; downloadUrl?: string | null; fileName?: string };
type State = { status: "loading" } | { status: "error"; message: string; item?: ReaderItem } | { status: "ready"; item: ReaderItem };

/** Standalone annotator: opened in its own tab from the materials list and the dashboard. */
export function MaterialReaderPage() {
  return <AuthGuard><Reader /></AuthGuard>;
}

function Reader() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") || "";
    const controller = new AbortController();
    if (!id) { void Promise.resolve().then(() => setState({ status: "error", message: "Nenhum material indicado." })); return; }
    fetch(`/api/material-catalog/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { item?: ReaderItem; error?: string };
        if (!response.ok || !data.item) throw new Error(data.error || "Não foi possível abrir este material.");
        setState(data.item.viewUrl ? { status: "ready", item: data.item } : { status: "error", message: "Este material não tem um PDF para anotar.", item: data.item });
      })
      .catch((reason) => { if (!controller.signal.aborted) setState({ status: "error", message: reason instanceof Error ? reason.message : "Não foi possível abrir este material." }); });
    return () => controller.abort();
  }, []);

  const item = state.status === "loading" ? undefined : state.item;
  const back = () => {
    // Opened in a new tab from the list: closing returns to it. Otherwise go to the unit's materials.
    if (window.history.length <= 1) window.close();
    router.push(item?.unitCode ? `/materiais/?uc=${encodeURIComponent(item.unitCode.toLocaleUpperCase("pt-PT"))}` : "/materiais/");
  };

  if (state.status === "loading") return <QuietLoading label="A abrir o anotador" />;
  if (state.status === "error") return <main className={styles.pageState} role="alert">
    <FileText aria-hidden="true" />
    <strong>{state.message}</strong>
    <div>
      <button className="button button--secondary button--compact" type="button" onClick={back}><ArrowLeft aria-hidden="true" />Voltar aos materiais</button>
      {state.item?.downloadUrl && <a className="button button--primary button--compact" href={state.item.downloadUrl} download={state.item.fileName || true}><Download aria-hidden="true" />Descarregar</a>}
    </div>
  </main>;
  return <><title>{`${state.item.title} · Anotador`}</title><MaterialPdfReader materialId={state.item.id} title={state.item.title} viewUrl={state.item.viewUrl!} downloadUrl={state.item.downloadUrl} fileName={state.item.fileName} onClose={back} /></>;
}
