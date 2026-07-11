"use client";

import Script from "next/script";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-context";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; action: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

type Mode = "login" | "register" | "verify";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [siteKey, setSiteKey] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>("");
  const { user, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/";

  useEffect(() => {
    if (user) router.replace(next);
  }, [next, router, user]);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" }).then(async (response) => await response.json() as { turnstileSiteKey?: string }).then((result) => setSiteKey(result.turnstileSiteKey || "")).catch(() => setError("Não foi possível carregar a proteção de segurança."));
    queueMicrotask(() => setRememberMe(localStorage.getItem("gu_persistent_login") !== "false"));
  }, []);

  function renderTurnstile() {
    if (!siteKey || !window.turnstile || !turnstileContainer.current || widgetId.current) return;
    widgetId.current = window.turnstile.render(turnstileContainer.current, {
      sitekey: siteKey,
      action: mode === "register" ? "register" : "login",
      callback: setTurnstileToken,
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => setTurnstileToken(""),
    });
  }

  useEffect(() => {
    if (mode === "verify") return;
    widgetId.current = "";
    if (turnstileContainer.current) turnstileContainer.current.innerHTML = "";
    renderTurnstile();
    // renderTurnstile is intentionally driven by mode/siteKey changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, siteKey]);

  function changeMode(nextMode: Mode) {
    setMode(nextMode); setError(""); setMessage(""); setCode(""); setTurnstileToken("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const endpoint = mode === "login" ? "/api/auth/login" : mode === "register" ? "/api/auth/register" : "/api/auth/verify";
    const payload = mode === "verify" ? { email, code, rememberMe } : mode === "register" ? { fullName, email, password, turnstileToken, rememberMe } : { email, password, turnstileToken, rememberMe };
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; next?: string; code?: string };
      if (!response.ok) {
        if (result.code === "ACCOUNT_EXISTS") setMode("login");
        throw new Error(result.error || "Não foi possível concluir o pedido.");
      }
      if (mode === "register") { setMode("verify"); setMessage("Enviámos um código de seis algarismos para o seu email institucional."); }
      else { await refresh(); router.replace(next); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir o pedido.");
      if (mode !== "verify") { setTurnstileToken(""); window.turnstile?.reset(widgetId.current); }
    } finally { setBusy(false); }
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={renderTurnstile} />
      <div className="auth-tabs" role="tablist" aria-label="Tipo de acesso">
        <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => changeMode("login")}>Iniciar sessão</button>
        <button type="button" className={mode !== "login" ? "is-active" : ""} onClick={() => changeMode("register")}>Criar conta</button>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-form__intro"><h2>{mode === "login" ? "Bem-vindo" : mode === "register" ? "Criar conta" : "Confirmar email"}</h2><p>{mode === "verify" ? `Introduza o código enviado para ${email}.` : "Utilize exclusivamente o seu email institucional da Universidade do Porto."}</p></div>
        {mode === "register" && <label className="auth-field"><span>Nome completo</span><div><UserRound size={18} aria-hidden="true" /><input type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nome e apelido" minLength={3} maxLength={120} required /></div></label>}
        <label className="auth-field"><span>Email institucional</span><div><Mail size={18} aria-hidden="true" /><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="up123456789@up.pt" pattern="up[0-9]{9}@(up\.pt|edu\.med\.up\.pt)" required readOnly={mode === "verify"} /></div></label>
        {mode !== "verify" && <label className="auth-field"><span>Password</span><div><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar password" : "Mostrar password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{mode === "register" && <small>Mínimo de 12 caracteres, com maiúsculas, minúsculas, número e símbolo.</small>}</label>}
        {mode === "verify" && <label className="auth-field auth-field--code"><span>Código de confirmação</span><div><ShieldCheck size={18} aria-hidden="true" /><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" placeholder="000000" required /></div></label>}
        {mode === "login" && <label className="remember-login"><input type="checkbox" checked={rememberMe} onChange={(event) => { setRememberMe(event.target.checked); localStorage.setItem("gu_persistent_login", String(event.target.checked)); }} /><span><strong>Manter sessão iniciada</strong><small>Recomendado num dispositivo pessoal: mantém o acesso durante 7 dias.</small></span></label>}
        {mode !== "verify" && <div className="turnstile-wrap" ref={turnstileContainer} />}
        {message && <p className="auth-message" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button--primary button--full auth-submit" type="submit" disabled={busy || (mode !== "verify" && !turnstileToken)}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}{busy ? "A processar…" : mode === "login" ? "Iniciar sessão" : mode === "register" ? "Enviar código" : "Confirmar e entrar"}</button>
        {mode === "verify" && <button className="auth-back" type="button" onClick={() => changeMode("register")}>Alterar email ou pedir novo código</button>}
      </form>
    </>
  );
}
