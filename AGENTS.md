# Regras operacionais do Gestor Universitário

- Nunca executar `wrangler deploy` localmente.
- Nunca executar `npx wrangler deploy` localmente.
- Nunca executar `pnpm run deploy` localmente.
- Nunca publicar diretamente a aplicação ou o Worker na Cloudflare a partir deste computador.
- É permitido e obrigatório usar `wrangler d1 migrations apply gestor-universitario-prod --remote` quando uma alteração publicada exigir migrations da base de dados D1.
- Antes de aplicar migrations remotas, concluir os testes locais, executar `pnpm run build`, fazer commit e push para o GitHub.
- É permitido executar `pnpm dev` para desenvolvimento local.
- É permitido executar `pnpm run build` para validação local.
- É permitido executar `pnpm run preview` ou `wrangler dev` apenas para pré-visualização local.
- Um comando de preview nunca pode publicar nem modificar a aplicação de produção.
- Nunca fazer push automaticamente após cada pequena alteração; agrupar alterações relacionadas.
- Testar localmente antes de criar um commit e executar `pnpm run build` antes de publicar.
- Só fazer commit e push quando o utilizador pedir explicitamente para publicar ou enviar.
- O único fluxo permitido é: local → teste local → GitHub → Cloudflare.
- Antes de começar a trabalhar, executar `git fetch origin --prune` e confirmar que o ramo local está atualizado.
- Ao trabalhar em dois computadores, nunca editar simultaneamente versões desatualizadas do projeto.
- Nunca guardar tokens, palavras-passe ou segredos no repositório.
- Nunca adicionar `.env.local`, `.dev.vars` ou qualquer ficheiro de segredos ao Git.
- Nunca usar o navegador integrado do Codex neste projeto; para testes visuais ou interação web, usar exclusivamente o plugin do Chrome.

## Arquitetura e serviços

- Aplicação: Next.js 16, React 19 e TypeScript.
- Alojamento: Cloudflare Workers através de OpenNext.
- Persistência: Cloudflare D1.
- Proteção contra abuso: Cloudflare Turnstile e rate limiting.
- Email transacional: Resend.
- Testes: runner nativo do Node.js.
- Análise estática: ESLint.
- Código oficial: `https://github.com/paulo1525/gestor-universitario`.
- Produção: `https://gestoruniversitario.cc`.
- Ramo de produção: `main`.
- Cópia local recomendada: `C:\Projetos\gestor-universitario`.
- Não colocar o repositório no OneDrive.

## Desenvolvimento local

Requisitos: Node.js 20 ou superior e pnpm 11.0.7.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

A aplicação fica disponível em `http://127.0.0.1:3000`.

Para preparar uma base D1 exclusivamente local com utilizadores, turmas e estudantes fictícios:

```powershell
corepack pnpm run test:local:setup
corepack pnpm dev
```

O comando apresenta no terminal as contas de teste e a palavra-passe comum. Os dados criados são fictícios e não afetam a produção.

## Validação antes de publicar

```powershell
corepack pnpm test
corepack pnpm lint
corepack pnpm run build
```

As variáveis necessárias estão documentadas em `.dev.vars.example`. O ficheiro `.dev.vars` é apenas local e nunca pode ser versionado.

## Publicação

Fluxo obrigatório:

```text
alteração local → testes e build → GitHub main → Cloudflare Workers Build → produção
```

O push ou merge em `main` é o único evento autorizado a desencadear a publicação da aplicação. Não criar um segundo fluxo de deploy quando a integração nativa do Cloudflare estiver ativa.

Quando uma versão alterar o esquema da base de dados, aplicar as migrations D1 separadamente e apenas depois de os testes, o build, o commit e o push estarem concluídos.

## Privacidade e segredos

- O repositório nunca pode conter nomes, emails, números mecanográficos ou ficheiros reais de estudantes.
- Dados académicos pessoais devem permanecer na base de dados privada e ser apresentados apenas a utilizadores autorizados.
- Códigos de autenticação devem ter validade curta, utilização única e proteção contra tentativas abusivas.
- Operações administrativas relevantes devem permanecer auditáveis.
- Materiais submetidos devem passar por moderação antes da publicação.
- Tokens, palavras-passe e segredos devem existir apenas nos mecanismos próprios de variáveis de ambiente.
