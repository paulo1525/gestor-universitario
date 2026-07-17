# Gestor Universitário

<p align="center">
  <img src="public/logo-comissao-curso-fmup-2025-2031.png" alt="Logótipo da Comissão de Curso FMUP 2025–2031" width="280">
</p>

<p align="center">
  Plataforma digital da Comissão de Curso de Medicina 2025–2031 da FMUP.
  Um ponto único para acompanhar a vida académica, comunicar com a Comissão e organizar recursos do curso.
</p>

<p align="center">
  <a href="https://gestoruniversitario.cc"><strong>Abrir o Gestor Universitário</strong></a>
</p>

## O que é

O **Gestor Universitário** centraliza informação e tarefas que, de outra forma, ficam dispersas por emails, formulários, ficheiros e diferentes plataformas. Foi criado para aproximar os estudantes e a Comissão de Curso, facilitar a consulta de informação relevante e tornar os processos internos mais claros e auditáveis.

A plataforma serve dois públicos:

- **estudantes**, que encontram num só lugar avisos, calendário, unidades curriculares, documentos, materiais e canais de contacto;
- **membros e representantes da Comissão**, que dispõem de ferramentas para publicar conteúdos, responder a pedidos, gerir turmas e acompanhar os vários processos do curso.

O acesso a informação reservada é feito por autenticação com código temporário enviado para um email institucional previamente autorizado.

## Principais funcionalidades

### Informação académica

- **Dashboard pessoal** com avaliações, prazos, avisos, pedidos e atividade relevante.
- **Avisos e comunicados** publicados pela Comissão de Curso.
- **Calendário académico** com avaliações, entregas, eventos e prazos, filtros por unidade curricular e subscrição por ICS.
- **Unidades curriculares** com ano, semestre, ECTS, representantes e informação associada.
- **Pesquisa global** em comunicados, cadeiras, documentos, eventos e materiais.
- **Centro de notificações** com estado lido/não lido e preferências pessoais.

### Recursos e participação

- **Biblioteca de documentos** para atas, regulamentos, formulários e outros ficheiros úteis.
- **Materiais de estudo** organizados por unidade curricular, com submissão, moderação, favoritos, feedback e histórico de versões.
- **Links úteis** pesquisáveis e organizados por categoria, prioridade e unidade curricular.
- **Pedidos e sugestões**, identificados ou anónimos, com acompanhamento do respetivo estado.
- **Inquéritos rápidos** para auscultar os estudantes e divulgar resultados.
- **Diretório da Comissão** com membros, cargos, núcleos e contactos.

### Gestão de turmas

O módulo de turmas apoia a transição e distribuição dos estudantes entre turmas, preservando tanto quanto possível a composição existente e respeitando as regras de capacidade e equilíbrio.

Permite:

- importar e validar listas de estudantes;
- recolher preferências de permanência ou mudança;
- impedir números mecanográficos duplicados;
- registar estatutos especiais quando aplicável;
- calcular trocas diretas, ciclos de troca e ocupação de vagas livres;
- simular e rever colocações antes da aprovação;
- manter um histórico auditável de alterações e decisões;
- exportar os resultados finais.

Os detalhes funcionais deste processo encontram-se em [README-ATRIBUICAO-TURMAS.md](README-ATRIBUICAO-TURMAS.md) e [README-PERMUTAS.md](README-PERMUTAS.md).

## Perfis e controlo de acesso

A aplicação apresenta apenas as áreas e operações permitidas a cada utilizador:

- **Estudante:** consulta informação académica, utiliza os recursos disponíveis e envia pedidos ou contributos.
- **Representante de turma:** acompanha e submete os dados da turma que representa.
- **Membro da Comissão:** publica e gere conteúdos dentro das responsabilidades que lhe foram atribuídas.
- **Núcleo de Gestão e administração:** configura módulos, utilizadores e processos, valida submissões e consulta o histórico administrativo.

Os módulos podem ser ativados ou desativados individualmente, permitindo adaptar a plataforma às diferentes fases do ano letivo.

## Privacidade e segurança

O projeto segue os princípios de minimização de dados e acesso por função:

- o repositório não contém nomes, emails, números mecanográficos nem ficheiros reais de estudantes;
- dados académicos pessoais ficam na base de dados privada e só são apresentados a utilizadores autorizados;
- códigos de autenticação têm validade curta, utilização única e proteção contra tentativas abusivas;
- operações administrativas relevantes são registadas para auditoria;
- materiais submetidos passam por moderação antes de serem publicados;
- tokens, palavras-passe e outros segredos são mantidos fora do Git.

## Tecnologia

- [Next.js 16](https://nextjs.org/) e [React 19](https://react.dev/)
- TypeScript
- Cloudflare Workers através de OpenNext
- Cloudflare D1 para persistência de dados
- Cloudflare Turnstile e rate limiting para proteção contra abuso
- Resend para envio dos códigos temporários de autenticação
- testes com o runner nativo do Node.js e análise estática com ESLint

## Desenvolvimento local

### Requisitos

- Node.js 20 ou superior
- pnpm 11.0.7

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

A aplicação fica disponível em <http://127.0.0.1:3000>.

Para preparar uma base D1 exclusivamente local com utilizadores, turmas e estudantes fictícios:

```powershell
corepack pnpm run test:local:setup
corepack pnpm dev
```

O comando apresenta no terminal as contas de teste e a palavra-passe comum. Os dados criados são fictícios e não afetam a produção.

### Validação

```powershell
corepack pnpm test
corepack pnpm lint
corepack pnpm run build
```

As variáveis necessárias estão documentadas em `.dev.vars.example`. O ficheiro local `.dev.vars` e quaisquer outros ficheiros com segredos nunca devem ser adicionados ao Git.

## Publicação

A versão de produção é publicada exclusivamente pela integração entre o GitHub e a Cloudflare:

```text
alteração local → testes e build → GitHub main → Cloudflare Workers Build → produção
```

Não são feitos deploys da aplicação ou do Worker diretamente a partir de um computador de desenvolvimento. Quando uma versão altera o esquema da base de dados, as migrations D1 são aplicadas separadamente depois de os testes, o build, o commit e o push estarem concluídos.

## Ligações

- **Aplicação:** <https://gestoruniversitario.cc>
- **Código-fonte:** <https://github.com/paulo1525/gestor-universitario>
- **Comissão:** Comissão de Curso de Medicina da FMUP, mandato 2025–2031

---

Desenvolvido para tornar a comunicação, os recursos e os processos académicos mais simples, centralizados e transparentes.
