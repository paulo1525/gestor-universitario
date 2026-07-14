"use client";

import Script from "next/script";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; action: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

type Mode = "login" | "register" | "verify" | "reset-request" | "reset-confirm";

export function AuthForm() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [siteKey, setSiteKey] = useState("");
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef("");
  const { user, refresh } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/";

  useEffect(() => { if (user) router.replace(next); }, [user, next, router]);
  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then(async (response) => await response.json() as { turnstileSiteKey?: string })
      .then((result) => {
        const key = result.turnstileSiteKey || "";
        setSiteKey(key);
        if (key === "1x00000000000000000000AA") setToken("local-test");
      })
      .catch(() => setError(t("auth.securityLoadError")));
    queueMicrotask(() => setRemember(localStorage.getItem("gu_persistent_login") !== "false"));
  }, [t]);

  const render = useCallback(() => {
    if (siteKey === "1x00000000000000000000AA" || !siteKey || !window.turnstile || !container.current || widget.current || ["verify", "reset-confirm"].includes(mode)) return;
    widget.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action: mode === "register" ? "register" : mode === "reset-request" ? "password-reset" : "login",
      callback: setToken,
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    });
  }, [mode, siteKey]);

  useEffect(() => {
    widget.current = "";
    if (container.current) container.current.innerHTML = "";
    render();
  }, [render]);

  function change(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setCode("");
    setToken("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const endpoint = mode === "login" ? "/api/auth/login" : mode === "register" ? "/api/auth/register" : mode === "verify" ? "/api/auth/verify" : mode === "reset-request" ? "/api/auth/password-reset/request" : "/api/auth/password-reset/confirm";
    const payload = mode === "verify" ? { email, code, rememberMe: remember } : mode === "reset-request" ? { email, turnstileToken: token } : mode === "reset-confirm" ? { email, code, password } : mode === "register" ? { fullName, email, password, turnstileToken: token, rememberMe: remember } : { email, password, turnstileToken: token, rememberMe: remember };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; code?: string };
      if (!response.ok) {
        if (result.code === "ACCOUNT_EXISTS") setMode("login");
        throw new Error(result.error || t("auth.requestError"));
      }
      if (mode === "register") {
        setMode("verify");
        setMessage(t("auth.registerSent"));
      } else if (mode === "reset-request") {
        setMode("reset-confirm");
        setMessage(t("auth.resetSent"));
      } else if (mode === "reset-confirm") {
        setMode("login");
        setPassword("");
        setCode("");
        setMessage(t("auth.resetDone"));
      } else {
        await refresh();
        router.replace(next);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.requestError"));
      setToken("");
      window.turnstile?.reset(widget.current);
    } finally {
      setBusy(false);
    }
  }

  const needsPassword = !["verify", "reset-request"].includes(mode);
  const needsCode = ["verify", "reset-confirm"].includes(mode);
  const needsCaptcha = !needsCode;

  function canonicalizeEmail() {
    const canonical = email.trim().toLowerCase().replace(/@edu\.med\.up\.pt$/i, "@up.pt");
    if (canonical !== email) {
      setEmail(canonical);
      setMessage(t("auth.canonicalEmail"));
    }
  }

  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={render} />
    <div className="auth-tabs"><button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => change("login")}>{t("auth.login")}</button><button type="button" className={mode === "register" || mode === "verify" ? "is-active" : ""} onClick={() => change("register")}>{t("auth.register")}</button></div>
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-form__intro"><h2>{mode === "login" ? t("auth.welcome") : mode === "register" ? t("auth.register") : mode === "verify" ? t("auth.verify") : t("auth.reset")}</h2><p>{needsCode ? t("auth.codeIntro", { email }) : t("auth.institutionalIntro")}</p></div>
      {mode === "register" && <label className="auth-field"><span>{t("auth.fullName")}</span><div><UserRound /><input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={3} required /></div></label>}
      <label className="auth-field"><span>{t("auth.email")}</span><div><Mail /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onBlur={canonicalizeEmail} placeholder="up123456789@up.pt" pattern="up[0-9]{9}@(up\.pt|edu\.med\.up\.pt)" readOnly={needsCode} required /></div><small>{t("auth.emailHelp")}</small></label>
      {needsPassword && <label className="auth-field"><span>{mode === "reset-confirm" ? t("auth.newPassword") : t("auth.password")}</span><div><LockKeyhole /><input type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required /><button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")} title={show ? t("auth.hidePassword") : t("auth.showPassword")}>{show ? <EyeOff /> : <Eye />}</button></div>{mode !== "login" && <small>{t("auth.passwordHelp")}</small>}</label>}
      {needsCode && <label className="auth-field auth-field--code"><span>{t("auth.confirmationCode")}</span><div><ShieldCheck /><input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" placeholder="000000" required /></div></label>}
      {mode === "login" && <><label className="remember-login"><input type="checkbox" checked={remember} onChange={(event) => { setRemember(event.target.checked); localStorage.setItem("gu_persistent_login", String(event.target.checked)); }} /><span><strong>{t("auth.remember")}</strong></span></label><button className="auth-back" type="button" onClick={() => change("reset-request")}>{t("auth.forgot")}</button></>}
      {needsCaptcha && <div className="turnstile-wrap" ref={container} />}
      {message && <p className="auth-message">{message}</p>}
      {error && <p className="auth-error">{error}</p>}
      <button className="button button--primary button--full auth-submit" disabled={busy || (needsCaptcha && !token)}>{busy ? <LoaderCircle className="spin" /> : <ShieldCheck />}{busy ? t("auth.processing") : mode === "login" ? t("auth.login") : mode === "register" ? t("auth.sendCode") : mode === "verify" ? t("auth.verifyAndEnter") : mode === "reset-request" ? t("auth.sendResetCode") : t("auth.changePassword")}</button>
      {mode.startsWith("reset") && <button className="auth-back" type="button" onClick={() => change("login")}>{t("auth.backToLogin")}</button>}
    </form>
  </>;
}
