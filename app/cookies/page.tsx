import Link from "next/link";
import { ArrowLeft, Cookie, LockKeyhole, Settings2, ShieldCheck } from "lucide-react";
import styles from "./cookies.module.css";
import { SurfaceHeader } from "@/components/surface-header";

type StorageEntry = { name: string; purpose: string; duration: string };
const cookies: StorageEntry[] = [
  { name: "__Host-gu_session", purpose: "Autentica a conta e protege as áreas reservadas. Contém um token aleatório, sem nome, email ou palavra-passe.", duration: "Sessão do navegador, com validade máxima de 12 horas no servidor, ou 7 dias se escolher manter a sessão iniciada." },
  { name: "gu-quiz-preferences", purpose: "Recorda a configuração dos testes: unidade curricular, tópicos, modo, número de perguntas, formato de resposta e temporizador. É atualizado ao usar a página de testes; não contém perguntas, respostas ou resultados.", duration: "180 dias desde a última atualização." },
  { name: "gu-quiz-progress", purpose: "Permite retomar um teste através do identificador da tentativa e da posição da pergunta. As respostas e os resultados ficam associados à conta no servidor.", duration: "Até ao prazo do teste; em testes pausados ou sem temporizador, até 30 dias desde a última atualização. É removido ao concluir ou abandonar a tentativa." },
  { name: "gu-placement-filters-v1", purpose: "Recorda os filtros avançados escolhidos na área administrativa de colocações. Não guarda pesquisas livres, nomes ou números de estudantes.", duration: "90 dias desde a última atualização, ou até limpar os filtros." },
  { name: "gu_preview_user", purpose: "Recorda a conta selecionada na pré-visualização administrativa. Só funciona com uma sessão válida do administrador principal.", duration: "4 horas, ou até sair da pré-visualização." },
];
const browserStorage: StorageEntry[] = [
  { name: "gu_persistent_login", purpose: "Recorda a escolha de manter a sessão iniciada. Guarda apenas verdadeiro ou falso; não autentica a conta.", duration: "Armazenamento local, sem expiração automática." },
  { name: "gestor-theme, gestor-language, gestor-sidebar-collapsed", purpose: "Recordam o tema, o idioma e a apresentação do menu lateral escolhidos.", duration: "Armazenamento local, sem expiração automática." },
  { name: "gu-pdf-page:…, gu-pdf-zoom, gu-pdf-layout, gu-pdf-highlights-sidebar", purpose: "Recordam a página de leitura, o zoom, o modo de apresentação e a abertura do painel de anotações. Não contêm o texto das anotações.", duration: "Armazenamento local, sem expiração automática." },
  { name: "gu-pdf-v1", purpose: "Guarda cópias dos PDF abertos no leitor, no dispositivo, para acelerar a leitura. Quando existe ligação, a aplicação verifica a versão no servidor.", duration: "Cache do navegador, até 16 documentos recentes; sem prazo automático, até serem substituídos ou apagados." },
  { name: "dismissed-urgent-announcement-v2:…", purpose: "Recorda que fechou o destaque de um aviso urgente nesta sessão.", duration: "Armazenamento de sessão, até fechar o separador." },
  { name: "gu-test-mode, gu-test-persona, gu-test-state", purpose: "Guardam a opção e os dados fictícios do modo de demonstração, quando este é ativado.", duration: "Armazenamento local. Sair do modo remove a opção e o perfil; os dados fictícios permanecem até apagar os dados do site." },
];

function StorageTable({ entries }: { entries: StorageEntry[] }) {
  return <div className={styles.tableWrap}><table>
    <thead><tr><th scope="col">Nome</th><th scope="col">Finalidade</th><th scope="col">Duração</th></tr></thead>
    <tbody>{entries.map(entry => <tr key={entry.name}><th scope="row"><code>{entry.name}</code></th><td>{entry.purpose}</td><td>{entry.duration}</td></tr>)}</tbody>
  </table></div>;
}

export default function CookiesPage() {
  return (
    <main className={styles.page}>
      <article className={styles.document}>
        <SurfaceHeader headingLevel="h1" icon={<Cookie />} eyebrow="Gestor Universitário" title="Política de Cookies" />
        <p className={styles.updated}>Atualizada em <time dateTime="2026-10-04">4 de outubro de 2026</time></p>

        <div className={styles.introduction}>
          <ShieldCheck aria-hidden="true" />
          <p>Usamos cookies para autenticar e proteger a conta, recordar configurações e retomar testes. Também guardamos preferências e cópias de PDF no navegador. A aplicação não integra cookies de publicidade ou de análise comportamental; a proteção contra abuso utiliza serviços da Cloudflare.</p>
        </div>

        <section className={styles.section} aria-labelledby="cookies-utilizados">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true"><Cookie /></span>
            <h2 id="cookies-utilizados">Cookies utilizados</h2>
          </div>
          <StorageTable entries={cookies} />
        </section>

        <section className={styles.section} aria-labelledby="armazenamento-navegador">
          <div className={styles.sectionHeading}><span aria-hidden="true"><Settings2 /></span><h2 id="armazenamento-navegador">Outros dados guardados no navegador</h2></div>
          <p>Estes mecanismos pertencem ao navegador e não são enviados automaticamente em cada pedido, como acontece com os cookies. Pode eliminá-los nas definições de dados deste site.</p>
          <StorageTable entries={browserStorage} />
          <p>As preferências de notificações e os estados de leitura e arquivo são guardados na conta, no servidor. Apagar os dados do navegador não elimina esses registos, as respostas aos testes ou as anotações associadas à conta.</p>
        </section>

        <section className={styles.section} aria-labelledby="cloudflare">
          <div className={styles.sectionHeading}><span aria-hidden="true"><ShieldCheck /></span><h2 id="cloudflare">Proteção da Cloudflare</h2></div>
          <p>O Turnstile verifica pedidos de autenticação para distinguir pessoas de programas automatizados. A Cloudflare processa sinais técnicos, como o endereço IP e informações do navegador, para proteger o serviço e melhorar a deteção de abuso. Consulte a <a href="https://www.cloudflare.com/turnstile-privacy-policy/">informação de privacidade do Turnstile</a>.</p>
          <p>Por defeito, o Turnstile devolve um token de utilização única. Se as regras de proteção da Cloudflare apresentarem desafios ou ativarem pré-validação, podem existir cookies técnicos adicionais, como <code>cf_clearance</code>; a sua duração depende das regras configuradas. Os cookies aplicáveis são descritos na <a href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/">documentação da Cloudflare</a>.</p>
        </section>

        <section className={styles.section} aria-labelledby="fundamento-consentimento">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true"><LockKeyhole /></span>
            <h2 id="fundamento-consentimento">Fundamento e consentimento</h2>
          </div>
          <p>Nos termos do <a href="https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2004-106523049">artigo 5.º da Lei n.º 41/2004</a>, o armazenamento estritamente necessário para prestar um serviço expressamente solicitado pode estar dispensado de consentimento prévio. A sessão permite o acesso autenticado; os mecanismos funcionais descritos acima apoiam as funções utilizadas ou as configurações escolhidas. Não são usados para publicidade ou criação de perfis.</p>
          <p>Manter a sessão durante 7 dias é opcional: pode alterar esta escolha no início de sessão ou em “Preferências de cookies”. Esta escolha controla apenas a duração da sessão; não é uma autorização geral para outros cookies ou armazenamento.</p>
        </section>

        <section className={styles.section} aria-labelledby="protecao">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true"><ShieldCheck /></span>
            <h2 id="protecao">Proteção</h2>
          </div>
          <p>Em produção, o cookie de sessão usa HTTPS, <code>HttpOnly</code>, <code>Secure</code> e <code>SameSite=Strict</code>; o servidor guarda apenas um hash do token. Os restantes cookies próprios também usam <code>Secure</code> e restringem o envio entre sites através de <code>SameSite</code>. Os cookies dos testes e as preferências locais não contêm palavras-passe. O acesso a tentativas guardadas continua a exigir autenticação e autorização.</p>
        </section>

        <section className={styles.section} aria-labelledby="gerir-apagar">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true"><Settings2 /></span>
            <h2 id="gerir-apagar">Gerir ou apagar</h2>
          </div>
          <p>Desative “Manter sessão iniciada” para usar um cookie de sessão do navegador, com limite de 12 horas no servidor. O navegador pode restaurar cookies de sessão ao reabrir separadores; num dispositivo partilhado, use sempre “Terminar sessão”, que elimina o cookie de autenticação e revoga o token no servidor.</p>
          <p>Use “Limpar filtros” nas colocações, saia da pré-visualização administrativa ou conclua ou abandone o teste para remover os respetivos cookies. Para apagar também preferências e cópias locais de PDF, elimine os cookies e os dados de <strong>gestoruniversitario.cc</strong> nas definições do navegador. Isto termina o acesso local e repõe as configurações do dispositivo. Bloquear todos os cookies impede o início de sessão e pode limitar a retoma de testes.</p>
        </section>

        <footer className={styles.actions}>
          <Link className="button button--primary" href="/login/"><ArrowLeft aria-hidden="true" />Voltar ao início de sessão</Link>
        </footer>
      </article>
    </main>
  );
}
