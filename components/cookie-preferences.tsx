"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { OPEN_COOKIE_PREFERENCES } from "@/components/floating-actions";
import { FormCloseButton } from "@/components/form-actions";
import { useI18n } from "@/components/i18n-context";
import { useEscapeKey } from "@/components/use-escape-key";

const PERSISTENCE_KEY = "gu_persistent_login";

/* Cookie preferences in the shared light modal (same anatomy as every other modal). */
export function CookiePreferences() {
  const { t } = useI18n();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    const show = () => { setError(""); try { setPersistent(localStorage.getItem(PERSISTENCE_KEY) !== "false"); } catch { /* Keep the current choice if storage is unavailable. */ } setOpen(true); };
    window.addEventListener(OPEN_COOKIE_PREFERENCES, show);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES, show);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      try { setPersistent(localStorage.getItem(PERSISTENCE_KEY) !== "false"); } catch { /* Storage can be unavailable in private browsing. */ }
    });
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/session-preference", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ persistent }) });
      if (!response.ok) throw new Error(t("cookies.saveError"));
      try { localStorage.setItem(PERSISTENCE_KEY, String(persistent)); } catch { /* The server preference was saved even if local storage is unavailable. */ }
      setOpen(false);
    } catch { setError(t("cookies.saveError")); }
    finally { setSaving(false); }
  }

  function close() { setOpen(false); }

  if (!open) return null;
  return (
    <div className="app-modal-backdrop" data-app-modal-backdrop role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
      <section id="cookie-preferences-panel" data-app-modal="modal" data-app-modal-size="compact" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="app-modal-header" data-app-modal-header>
          <h2 id={titleId}>{t("cookies.title")}</h2>
          <FormCloseButton onClick={close} label={t("common.close")} />
        </header>
        <div className="cookie-options" data-app-modal-body>
          <p className="cookie-options__intro">{t("cookies.description")}</p>
          <div className="cookie-option"><strong>{t("cookies.essential")}</strong><span className="cookie-required">{t("cookies.alwaysActive")}</span></div>
          <label className="cookie-option"><span><strong>{t("cookies.keepSignedIn")}</strong><small>{t("cookies.keepSignedInDescription")}</small></span><input className="toggle" type="checkbox" checked={persistent} disabled={saving} onChange={(event) => setPersistent(event.target.checked)} /></label>
          {error && <p className="cookie-options__error" role="alert">{error}</p>}
        </div>
        <footer data-app-modal-footer>
          <Link className="cookie-policy-link" href="/cookies/" onClick={close}>{t("cookies.policy")}</Link>
          <button className="button button--primary" data-app-modal-action="primary" type="button" disabled={saving} aria-busy={saving || undefined} onClick={() => void save()}>{t(saving ? "cookies.saving" : "cookies.save")}</button>
        </footer>
      </section>
    </div>
  );
}
