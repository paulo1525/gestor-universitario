"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useI18n } from "@/components/i18n-context";

const PERSISTENCE_KEY = "gu_persistent_login";

/* Simplified cookie preferences, shown only in the profile menu: essential
   cookies are always on; the single optional choice saves as soon as it changes. */
export function CookiePreferencesSetting() {
  const { t } = useI18n();
  const labelId = useId();
  const [persistent, setPersistent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      try { setPersistent(localStorage.getItem(PERSISTENCE_KEY) !== "false"); } catch { /* Storage can be unavailable in private browsing. */ }
    });
  }, []);

  async function change(next: boolean) {
    if (saving) return;
    const previous = persistent;
    setPersistent(next);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/session-preference", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ persistent: next }) });
      if (!response.ok) throw new Error();
      try { localStorage.setItem(PERSISTENCE_KEY, String(next)); } catch { /* The server preference was saved even if local storage is unavailable. */ }
    } catch {
      setPersistent(previous);
      setError(t("cookies.saveError"));
    } finally { setSaving(false); }
  }

  return (
    <section role="group" aria-labelledby={labelId} className="profile-cookies">
      <span id={labelId} className="profile-menu__label"><Cookie />{t("cookies.menuLabel")}</span>
      <label className="profile-cookies__option">
        <span><strong>{t("cookies.keepSignedIn")}</strong><small>{t("cookies.essentialAlwaysOn")}</small></span>
        <input className="toggle" type="checkbox" checked={persistent} disabled={saving} aria-busy={saving || undefined} onChange={(event) => void change(event.target.checked)} />
      </label>
      {error && <p className="profile-cookies__error" role="alert">{error}</p>}
      <Link className="profile-cookies__policy" href="/cookies/">{t("cookies.policy")}</Link>
    </section>
  );
}
