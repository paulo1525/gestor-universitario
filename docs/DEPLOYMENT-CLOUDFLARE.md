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

Depois de o bucket estar provisionado, os objetos devem ser carregados com as
chaves `storage_key` catalogadas na migration 0057. Antes de marcar um objeto
como pronto, confirme o tamanho e o SHA-256 indicados no catálogo. O upload é
uma operação externa ao repositório e não deve adicionar binários grandes ao
Git.

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

Os segredos (`AUTH_PEPPER`, `RESEND_API_KEY` e `TURNSTILE_SECRET_KEY`) são
configurados como secrets do Worker; não devem ser colocados em
`wrangler.jsonc`, `.env.local` ou `.dev.vars` versionados.
