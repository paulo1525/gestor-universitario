# Perguntas em ficheiros privados da aplicação

Os testes e o banco de questões leem JSON em blocos de 32 perguntas. Os ficheiros
em `private/questions/` são comprimidos e cifrados com AES-256-GCM, porque o
repositório GitHub é público. `worker/quiz-content-index.json` contém apenas a
revisão, contagens e verificações de integridade. A chave nunca entra no Git.

O build inclui os ficheiros cifrados nos assets da própria aplicação. O backend
abre-os através da ligação interna `ASSETS`, depois de validar a sessão e os
módulos disponíveis. A configuração `run_worker_first` e o Worker bloqueiam
qualquer URL direto em `/__private_quiz/`, mesmo com sessão. Não existe um
endpoint para descarregar o JSON completo. Nenhuma destas operações usa R2.

A administração não tem editor, importação ou publicação de perguntas. A antiga
rota redireciona para `/admin/` e a API de gestão recusa alterações no modo
`files`. As atualizações seguem o fluxo GitHub → Cloudflare Workers Build.

## Configuração inicial

Antes da primeira publicação, guardar `QUIZ_CONTENT_KEY` como segredo do Worker
na Cloudflare, com o mesmo valor gerado no `.dev.vars` local pelo empacotamento.
Não colocar o valor no código, nas variáveis públicas, em logs nem no GitHub.
O build não precisa da chave; apenas o backend precisa dela em execução.
Sem uma chave válida, o acesso às perguntas fecha com erro 503.

O snapshot inicial usa apenas as seis tabelas de conteúdo. Não exporta sessões,
utilizadores, respostas, progresso ou auditoria. Os ficheiros legíveis ficam
numa pasta privada fora do repositório. A exportação remota é exclusivamente de
leitura e não publica nem altera a aplicação.

```powershell
node scripts/prepare-quiz-json-storage.mjs --remote --output C:\CaminhoPrivado\snapshot
node scripts/pack-quiz-content.mjs --source C:\CaminhoPrivado\snapshot --rebuild
```

O snapshot deve ser recente antes da publicação, para incluir todas as últimas
alterações feitas no editor antigo. O código e os ficheiros cifrados são
publicados juntos, seguindo os testes, o build e a PR definidos no `AGENTS.md`.
Esta alteração não exige migrations remotas.

## Editar e publicar perguntas

```powershell
node scripts/unpack-quiz-content.mjs --output C:\CaminhoPrivado\perguntas
```

Editar os JSON legíveis nessa pasta: enunciados, soluções e opções ficam nos
blocos `quiz-*.json`; os temas ficam no manifest. Os blocos `bank-*.json` contêm
o banco de questões, e os `bank-index.json` contêm os seus temas e fontes.
Manter os IDs de perguntas e opções existentes para preservar o histórico.
Perguntas novas precisam de IDs únicos, uma unidade curricular ativa do site
e uma relação válida com o respetivo tema. Perguntas e temas só aparecem aos
estudantes quando têm estado `published` e não estão eliminados.

```powershell
node scripts/pack-quiz-content.mjs --source C:\CaminhoPrivado\perguntas --rebuild
corepack pnpm test
corepack pnpm lint
corepack pnpm run build
```

`--rebuild` valida os IDs e as relações, recalcula os índices e cria uma nova
revisão. Ficheiros cujo conteúdo não mudou conservam a sua versão cifrada.
Nunca adicionar a pasta de JSON legíveis ao Git. Fazer commit e push apenas
quando a publicação estiver explicitamente autorizada.

### Neuroanatomia — edição final de 29/09/2026

`scripts/update-neuro-compendium.mjs` atualiza exclusivamente os registos de
Neuroanatomia no export privado antes do `pack --rebuild`. Recebe `--source`
com a base `Compendio/Base/questoes.json`, `--content` com o diretório privado
desempacotado e `--groups` com um JSON privado extraído de `estrutura_aulas.py`:
uma lista na ordem de `GROUPS`, com `code`, `title`, `indices` e `count` (contagem
das perguntas incluídas nesses índices). Conferir este ficheiro com o guia e
os dois PDFs finais de `Entregas/` antes de executar a atualização.

A edição tem 1.174 registos internos: 1.164 publicados, dez excluídos e 283
soluções com ressalvas. Os 17 conjuntos AT/AP substituem os temas anteriores.
Os IDs derivados dos identificadores persistentes `Q` são os mesmos da
importação anterior; os 295 registos antigos de AP1 são arquivados sem remover
as suas opções, preservando tentativas, respostas e comentários na D1.
As conclusões, ressalvas, referências e proveniência da base ficam no conteúdo
cifrado. Esta operação não lê Ankis nem exige migrations remotas.

## Histórico e recuperação

Para recuperar uma revisão quando a chave só existe no Worker, um administrador
pode descarregar `/api/admin/quizzes/content-export`. O backup privado em NDJSON
inclui todos os ficheiros, sem filtrar conteúdos arquivados ou apagados, e não
contém a chave. Guardar o download fora do repositório e restaurar para uma pasta
nova com `node scripts/restore-quiz-content-export.mjs --source PARTE1,PARTE2 --output PASTA`.
Cada resposta contém até 32 ficheiros; continuar com `?offset=32`, `?offset=64`,
etc., até ao `fileCount` indicado no índice. As partes têm de pertencer à mesma
revisão e ser restauradas pela ordem original.
O restauro confere os checksums e só grava `transfer.json` quando está completo.
A exportação fica registada na auditoria.

Uma rotação sem interromper a versão atual usa o secret `QUIZ_CONTENT_KEY_NEXT`.
A versão atual continua a usar `QUIZ_CONTENT_KEY`; só um índice publicado com
`keySlot: "next"` passa a usar o novo secret. Configurar a nova chave antes de
publicar os ficheiros correspondentes e conservar a antiga para rollback.

Respostas, comentários, progresso e snapshots de tentativas permanecem na D1.
Os registos antigos são preservados. Para perguntas novas, o início da tentativa
regista apenas os IDs e relações necessários às chaves estrangeiras, sem copiar
enunciados, soluções ou opções para as tabelas do catálogo.

Uma tentativa já iniciada continua a usar o seu snapshot e pode ser retomada,
respondida e concluída mesmo se os ficheiros ficarem indisponíveis. A cache em
memória pertence à versão publicada e não ultrapassa a autenticação da API.

Guardar uma cópia privada da chave. Para recuperar uma versão, republicar o
código, o índice e os ficheiros cifrados da mesma revisão. Não reativar a D1 como
catálogo depois de editar os ficheiros: a cópia antiga deixaria de representar
as perguntas atuais. As migrations históricas já públicas mantêm o conteúdo
anterior que continham; a cifragem dos novos ficheiros não remove esse histórico.
