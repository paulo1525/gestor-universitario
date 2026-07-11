"use client";

import Link from "next/link";
import { Cookie, X } from "lucide-react";
import { useEffect, useState } from "react";

const PERSISTENCE_KEY = "gu_persistent_login";

export function CookiePreferences() {
  const [open, setOpen] = useState(false);
  const [persistent, setPersistent] = useState(true);

  useEffect(() => {
    queueMicrotask(() => {
      setPersistent(localStorage.getItem(PERSISTENCE_KEY) !== "false");
    });
  }, []);

  async function save() {
    localStorage.setItem(PERSISTENCE_KEY, String(persistent));
    await fetch("/api/auth/session-preference", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ persistent }) }).catch(() => undefined);
    setOpen(false);
  }

  function close() { setOpen(false); }

  return (
    <>
      <button className="cookie-settings-button" type="button" onClick={() => setOpen(true)} aria-label="Abrir preferências de cookies"><Cookie size={17} /></button>
      {open && <div className="cookie-panel" role="dialog" aria-modal="false" aria-labelledby="cookie-title">
        <div className="cookie-panel__header"><div><Cookie size={20} /><h2 id="cookie-title">Preferências de cookies</h2></div><button type="button" onClick={close} aria-label="Fechar"><X size={18} /></button></div>
        <p>Usamos cookies essenciais para autenticar e proteger a sua conta. Estão sempre ativos.</p>
        <div className="cookie-option"><div><strong>Cookies essenciais</strong><span>Permitem iniciar sessão e manter a conta segura.</span></div><span className="cookie-required">Sempre ativos</span></div>
        <label className="cookie-option"><div><strong>Manter sessão iniciada</strong><span>Recomendado neste dispositivo pessoal: mantém o acesso durante 7 dias.</span></div><input className="toggle" type="checkbox" checked={persistent} onChange={(event) => setPersistent(event.target.checked)} /></label>
        <div className="cookie-panel__actions"><Link href="/cookies/" onClick={close}>Política de Cookies</Link><button className="button button--primary" type="button" onClick={() => void save()}>Guardar preferências</button></div>
      </div>}
    </>
  );
}
