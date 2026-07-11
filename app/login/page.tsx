import Image from "next/image";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="brand__logo-frame auth-brand__logo-frame"><Image className="brand__logo auth-brand__logo-image" src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt="Comissão de Curso FMUP 2025–2031" width={58} height={58} priority /></span>
          <div><span>Comissão de Curso</span><h1 id="auth-title">Gestor Universitário</h1></div>
        </div>
        <Suspense fallback={<p>A carregar o acesso seguro…</p>}><AuthForm /></Suspense>
      </section>
      <aside className="auth-information">
        <span className="eyebrow">Acesso institucional</span>
        <h2>Uma área reservada aos estudantes da FMUP.</h2>
        <p>Para criar uma conta, utiliza obrigatoriamente o teu email institucional da Universidade do Porto.</p>
        <div className="auth-email-examples" aria-label="Formatos de email aceites"><span>up123456789@up.pt</span><span>up123456789@edu.med.up.pt</span></div>
      </aside>
    </main>
  );
}
