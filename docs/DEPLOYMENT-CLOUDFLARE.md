# Configuração Cloudflare e publicação

O Worker é compilado com OpenNext e publicado pela integração de build do
Cloudflare. A compilação é deliberadamente independente de operações remotas:
o comando de build (`pnpm cf:build`) não aplica migrations nem altera D1/R2.

## Recursos externos obrigatórios

`wrangler.jsonc` declara os seguintes recursos de produção:

- D1 `gestor-universitario-prod`, binding `DB`, com `migrations_dir` apontado
  para `migrations/`;
- R2 `gestor-universitario-materials`, binding `MATERIALS_BUCKET`.

O bucket R2 tem de existir na mesma conta Cloudflare antes da publicação. O
Worker não deve assumir que o conteúdo já foi carregado: enquanto um objeto
não estiver disponível, os registos do catálogo permanecem com
`storage_state='pending'` e os endpoints devolvem `STORAGE_NOT_READY`.

## Controlo de custos R2

O bucket `gestor-universitario-materials` usa a classe **Standard** e não tem
acesso público. O pré-processamento dos materiais corre fora dos pedidos HTTP;
os downloads apenas lêem objetos já preparados. O Worker reserva, na D1, uma
ou duas operações Class B por pedido antes de aceder ao R2. A quota da aplicação
é de 100 000 operações reservadas por mês UTC, muito abaixo dos 10 milhões de
leituras mensais incluídas no nível gratuito. Se a quota se esgotar ou a D1
estiver indisponível, o download é bloqueado sem contactar o R2.

Esta quota abrange apenas os downloads feitos pelo Worker desta aplicação.
Uploads, utilização direta da API/painel, outras aplicações na mesma conta e
armazenamento não ficam sujeitos a ela. Confirmar sempre a classe Standard,
o volume preparado e o consumo no painel antes de carregar objetos. Os avisos
de orçamento da Cloudflare são informativos e **não** suspendem a utilização:
não representam um teto de faturação de 0 €.

Depois de o bucket estar provisionado, os objetos devem ser carregados com as
chaves `storage_key` catalogadas na migration 0057. Antes de marcar um objeto
como pronto, confirme o tamanho e o SHA-256 indicados no catálogo. O upload é
uma operação externa ao repositório e não deve adicionar binários grandes ao
Git.

### Autorização e preparação dos artefactos

O autor confirmou autorização para redistribuir os elementos incluídos nos
dois APKG e no ZIP de bibliografia, incluindo as imagens Yokochi e os excertos
de Gray, Lippincott e Nolte. O script `scripts/prepare-material-artifacts.mjs`
valida os checksums, extrai de forma determinística os 32 ficheiros individuais
catalogados e marca estes artefactos como `ready`; o upload continua a ser uma
operação separada e explícita. Os PDFs de capa derivados permanecem opcionais
e `review-required`, porque não fazem parte do conjunto autorizado original.

Nunca carregar ficheiros fora do manifesto, versões com checksum divergente,
referências MIMED ou dados pessoais.

## Ordem de uma versão

1. Executar `pnpm test`, `pnpm lint`, `pnpm run build` e `pnpm run cf:build`.
2. Fazer commit e push do ramo; a integração Cloudflare executa apenas o build
   OpenNext.
3. Aplicar as migrations D1 separadamente, após os checks do ramo, com
   `pnpm db:migrate:remote` (ou o comando equivalente apontando para
   `gestor-universitario-prod`). Nunca executar este passo como parte de
   `wrangler build`.
4. Carregar os objetos R2 e confirmar os checksums/tamanhos no catálogo.
5. Validar autenticadamente os downloads e os estados de fallback antes de
   ativar o módulo de Materiais para utilizadores finais.

### Wrangler em Windows ARM64

O pacote `wrangler` usa o runtime `workerd` e a instalação local ARM64 pode
falhar antes de executar qualquer comando. Depois do push, a rota recomendada
é um runner GitHub Actions Ubuntu x64 autenticado com o secret
`CLOUDFLARE_API_TOKEN` (permissão D1 Editar), fazendo uma instalação limpa e
executando:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler d1 migrations apply gestor-universitario-prod --remote
```

`CLOUDFLARE_ACCOUNT_ID` pode ser fornecido como secret se a organização o
exigir; não guardar tokens no repositório. Uma alternativa local é instalar o
Node.js Windows x64 emulado, confirmar `process.arch === 'x64'` e reinstalar as
dependências com o lockfile antes de chamar o mesmo comando. Não reutilizar o
`node_modules` criado pelo Node ARM64, porque o binário opcional de `workerd`
é escolhido durante a instalação. A consola D1 do painel permite consultas
manuais, mas não deve substituir `migrations apply`: não mantém de forma
segura o histórico `d1_migrations` da migration.

Os segredos (`AUTH_PEPPER`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` e, se
necessário num ambiente novo, `BOOTSTRAP_ADMIN_EMAIL`) são configurados como
secrets do Worker; não devem ser colocados em `wrangler.jsonc`, `.env.local`
ou `.dev.vars` versionados. O `BOOTSTRAP_ADMIN_EMAIL` só é necessário para o
bootstrap de uma base nova; não o definir novamente numa base que já tenha um
administrador.
