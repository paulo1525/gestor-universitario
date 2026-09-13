"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnnotationDraft, StudyAnnotation } from "@/lib/study-annotations";

const endpoint = "/api/study/neuro-ap1/annotations";
async function loadAnnotations(signal?: AbortSignal) {
  const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal });
  const data = await response.json() as { error?: string; annotations: StudyAnnotation[] };
  if (!response.ok) throw new Error(data.error || "Não foi possível carregar os apontamentos.");
  return data.annotations;
}

export function useStudyAnnotations() {
  const [annotations, setAnnotations] = useState<StudyAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      setAnnotations(await loadAnnotations(signal)); setError("");
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os apontamentos.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadAnnotations(controller.signal).then(setAnnotations).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os apontamentos.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const save = async (draft: AnnotationDraft) => {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json() as { error?: string; annotation: StudyAnnotation };
      if (!response.ok) throw new Error(data.error || "Não foi possível guardar. O rascunho foi mantido.");
      const annotation = data.annotation as StudyAnnotation;
      setAnnotations((current) => [annotation, ...current.filter((item) => item.id !== annotation.id)]);
      setMessage("Guardado na sua conta.");
      return annotation;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível guardar. O rascunho foi mantido.");
      return null;
    } finally { setSaving(false); }
  };
  const remove = async (annotation: StudyAnnotation) => {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: annotation.id, revision: annotation.revision }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível eliminar o apontamento.");
      setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
      setMessage("Apontamento eliminado.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível eliminar o apontamento.");
      return false;
    } finally { setSaving(false); }
  };
  return { annotations, loading, error, saving, message, clearMessage: () => setMessage(""), reload, save, remove };
}
