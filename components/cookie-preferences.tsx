"use client";

import Link from "next/link";
import { Cookie, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-context";

const PERSISTENCE_KEY = "gu_persistent_login";

export function CookiePreferences() {
  const { t } = useI18n();
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
      <button className="cookie-settings-button" type="button" onClick={() => setOpen((current) => !current)} aria-label={open ? t("cookies.close") : t("cookies.open")} aria-expanded={open} aria-controls="cookie-preferences-panel"><Cookie size={17} /></button>
      {open && <div id="cookie-preferences-panel" className="cookie-panel" role="dialog" aria-modal="false" aria-labelledby="cookie-title">
        <div className="cookie-panel__header"><div><Cookie size={20} /><h2 id="cookie-title">{t("cookies.title")}</h2></div><button type="button" onClick={close} aria-label={t("common.close")}><X size={18} /></button></div>
        <p>{t("cookies.description")}</p>
        <div className="cookie-option"><div><strong>{t("cookies.essential")}</strong><span>{t("cookies.essentialDescription")}</span></div><span className="cookie-required">{t("cookies.alwaysActive")}</span></div>
        <label className="cookie-option"><div><strong>{t("cookies.keepSignedIn")}</strong><span>{t("cookies.keepSignedInDescription")}</span></div><input className="toggle" type="checkbox" checked={persistent} onChange={(event) => setPersistent(event.target.checked)} /></label>
        <div className="cookie-panel__actions"><Link href="/cookies/" onClick={close}>{t("cookies.policy")}</Link><button className="button button--primary" type="button" onClick={() => void save()}>{t("cookies.save")}</button></div>
      </div>}
    </>
  );
}
