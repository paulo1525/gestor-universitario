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
  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_COOKIE_PREFERENCES, show);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES, show);
  }, []);

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
          <label className="cookie-option"><span><strong>{t("cookies.keepSignedIn")}</strong><small>{t("cookies.keepSignedInDescription")}</small></span><input className="toggle" type="checkbox" checked={persistent} onChange={(event) => setPersistent(event.target.checked)} /></label>
        </div>
        <footer data-app-modal-footer>
          <Link className="cookie-policy-link" href="/cookies/" onClick={close}>{t("cookies.policy")}</Link>
          <button className="button button--primary" data-app-modal-action="primary" type="button" onClick={() => void save()}>{t("cookies.save")}</button>
        </footer>
      </section>
    </div>
  );
}
