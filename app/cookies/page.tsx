import Link from "next/link";
import { ArrowLeft, Clock3, Cookie, LockKeyhole, Settings2, ShieldCheck } from "lucide-react";
import styles from "./cookies.module.css";

export default function CookiesPage() {
  return (
    <main className={styles.page}>
      <article className={styles.document}>
        <header className={styles.hero}>
          <span className={styles.heroIcon} aria-hidden="true"><Cookie /></span>
          <div>
            <span className="eyebrow">Gestor Universitário</span>
            <h1>Política de Cookies</h1>
            <p className={styles.updated}><Clock3 aria-hidden="true" />Última atualização: 10 de julho de 2026</p>
          </div>
        </header>

        <div className={styles.introduction}>
          <ShieldCheck aria-hidden="true" />
          <p>O Gestor Universitário utiliza apenas cookies necessários à autenticação e segurança. Não utilizamos cookies de publicidade, perfil comportamental ou análise de terceiros.</p>
        </div>

        <section className={styles.section} aria-labelledby="cookies-utilizados">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true"><Cookie /></span>
            <h2 id="cookies-utilizados">Cookies utilizados</h2>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr><th scope="col">Cookie</th><th scope="col">Finalidade</th><th scope="col">Duração</th></tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row"><code>__Host-gu_session</code></th>
                  <td>Autentica o utilizador, protege o acesso à conta e permite terminar a sessão.</td>
                  <td>Sessão do navegador ou 7 dias, consoante a preferência escolhida.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="fundamento-consentimento">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true"><LockKeyhole /></span>
            <h2 id="fundamento-consentimento">Fundamento e consentimento</h2>
          </div>
          <p>O cookie de sessão é estritamente necessário para prestar o serviço pedido pelo utilizador. A persistência durante 7 dias é opcional e pode ser ativada ou desativada em “Preferências de cookies”.</p>
        </section>

        <section className={styles.section} aria-labelledby="protecao">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true"><ShieldCheck /></span>
            <h2 id="protecao">Proteção</h2>
          </div>
          <p>O cookie é enviado apenas por HTTPS e está marcado como <code>HttpOnly</code>, <code>Secure</code> e <code>SameSite=Strict</code>. O seu conteúdo não é acessível a JavaScript e a base de dados guarda apenas um hash do token.</p>
        </section>

        <section className={styles.section} aria-labelledby="gerir-apagar">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true"><Settings2 /></span>
            <h2 id="gerir-apagar">Gerir ou apagar</h2>
          </div>
          <p>Desative “Guardar início de sessão” para voltar a uma sessão que termina ao fechar o navegador. Terminar sessão elimina imediatamente o cookie e revoga o token no servidor.</p>
        </section>

        <footer className={styles.actions}>
          <Link className="button button--primary" href="/login/"><ArrowLeft aria-hidden="true" />Voltar ao início de sessão</Link>
        </footer>
      </article>
    </main>
  );
}
