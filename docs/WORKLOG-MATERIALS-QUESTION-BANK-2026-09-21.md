# Passagem de trabalho: materiais e banco de perguntas

## Atualização para publicação, 2026-09-21 16:50 UTC

O utilizador retomou e autorizou expressamente publicar a aplicação e aplicar as migrations D1 remotas. Mobilizados três subagentes Luna Max: banco de perguntas, PDF/capas e R2. Esta secção prevalece sobre as notas de pausa e pendências históricas abaixo.

- Os três blocos de código estão integrados na worktree `C:\Projetos\gestor-universitario-pr97`, ramo `codex/continue-pr97`. Ainda sem commit/push nesta atualização. A PR #97 permanece em draft e o build Cloudflare anterior falhou antes de o R2 ser ativado.
- Banco de Neuroanatomia: 1 207 perguntas importadas; 890 publicadas após triagem conservadora (`VALIDADO`, confiança `ALTO`, sem aviso), 317 em revisão; metadados dos 18 campos preservados; duas perguntas têm opções múltiplas reais. A API limita exportação às publicadas e aplica os filtros do servidor. A qualidade científica final de cada pergunta não foi revista manualmente.
- Exportação PDF: 11 capas geradas no ChatGPT, uma por disciplina do 2.º ano, com títulos dinâmicos, filtros e paginação A4. O Anki personalizado é gerado no navegador a partir de cartões disponíveis; os APKG originais não estão publicados.
- R2: bucket privado Standard; salvaguarda D1 atómica limita a 100 000 reservas de leitura mensais via aplicação e fecha o acesso se D1 falhar. `HEAD`, Range e cache HTTP suportados. Isto não é um teto financeiro de 0 € nem cobre toda a conta R2.
- Direitos: os dois APKG de origem contêm imagens Yokochi/recortes e o ZIP bibliográfico contém excertos de obras protegidas. Permanecem `blocked`/`draft`, sem upload. Links de transferência ficam indisponíveis até aprovação de direitos ou substituição por conteúdo próprio.
- Privacidade: removido o email e número mecanográfico concretos que estavam fixos em código/configuração; autorização de administrador principal depende do cargo em D1. A variável opcional `BOOTSTRAP_ADMIN_EMAIL` deve ser secret no Cloudflare se for necessária para uma instalação nova. Os dados fictícios locais foram ajustados.
- Verificação final antes de commit: `pnpm test` 331/331, ESLint passou, `tsc --noEmit` passou e `pnpm run build` passou em Node Windows x64 emulado. O Node ARM64 instalado por defeito não suporta `workerd`. `git diff --check` sem erros de conteúdo.
- QA visual: capa PDF inspecionada em renderização; as páginas autenticadas locais redirecionam ao login e o setup de teste ARM64 falha, pelo que os quatro breakpoints de UI não foram exercitados num fluxo autenticado.
- D1 produção: `0057` e `0058` já aplicadas; `0059` e `0060` pendentes. Wrangler x64 reconhece OAuth com permissão D1. Uma tentativa de aplicar todas as migrations numa D1 local vazia falhou em migration histórica com `NOT NULL constraint failed: _seed_curricular_unit_actor.id`; isto não ocorreu nas migrations novas nem no estado de produção, mas deve ser corrigido em trabalho futuro.
- Próximos passos imediatos: atualizar esta issue, auditar `git status`/segredos, commit e push para a head da PR #97, executar `wrangler d1 migrations apply gestor-universitario-prod --remote`, confirmar counts e quota, marcar PR pronta e ativar auto-merge squash, esperar checks/Cloudflare Workers Build e verificar produção. Não executar deploy local.

Atualizado em 2026-09-21. Este ficheiro documenta uma implementação em curso. Conferir o estado do Git e os testes antes de retomar; não interpretar esta descrição como confirmação de publicação.

## Objetivo do utilizador

Disponibilizar compêndios e Anki de Neuroanatomia no Gestor Universitário, com escolha das partes a descarregar. A seleção pretendida inclui aulas, capítulos, subtemas, fonte, tipo de pergunta/cartão e inclusão de respostas, referências e imagens quando existirem. O utilizador ativou o Cloudflare R2 e escolheu mantê-lo com salvaguardas técnicas, aceitando que não existe garantia absoluta de custo zero. Pediu um registo detalhado no GitHub quando restarem 8% da janela de cinco horas do Codex.

## Repositório e fluxo

- Repositório: `paulo1525/gestor-universitario`; produção em `main`; PR de referência: #97, ainda em draft à data deste registo.
- Trabalho local isolado em `C:\Projetos\gestor-universitario-pr97`, ramo `codex/continue-pr97`, criado a partir de `428388b` de `origin/feat/implementation-orchestration`.
- A cópia normal `C:\Projetos\gestor-universitario` tinha alterações locais preexistentes e estava atrás de `origin/main`; não as substituir.
- `git fetch origin --prune` foi executado antes das alterações. Dependências instaladas com `corepack pnpm install --frozen-lockfile` na worktree.
- Regras em `AGENTS.md`: nunca executar deploy local; só `main` via GitHub aciona Cloudflare; testes, lint e build antes de publicar; migrations D1 remotas apenas depois de testes/build/commit/push; nunca versionar segredos ou dados pessoais; usar Chrome, não o navegador integrado, para QA visual.
- Ainda não houve commit, push, migration remota, upload R2 de materiais, nem publicação deste trabalho.

## Cloudflare R2 e custos

- O erro anterior no Cloudflare Workers Build da PR #97 era `Please enable R2 through the Cloudflare Dashboard` (código 10042), não uma falha do build Next/OpenNext. O utilizador ativou R2.
- Criado no painel Cloudflare o bucket privado `gestor-universitario-materials`, classe Standard, inicialmente vazio. Acesso público desativado.
- O plano Standard oferece uma franquia mensal de armazenamento e operações, com cobrança de excedentes. O valor base de 0 por mês não é um teto. Alertas de orçamento informam, mas não suspendem o serviço. Já existia um alerta de faturação a US$0,01; confirmar que permanece ativo.
- A migration `0060_r2_read_budget.sql` e `worker/r2-read-budget.ts` reservam atomicamente até 100 000 leituras mensais feitas pela aplicação, fechando o acesso se D1 falhar. O guard foi integrado em `worker/materials-catalog.ts` para downloads e imagens. Isto é uma salvaguarda parcial: não limita armazenamento, uploads ou outros acessos à mesma conta R2.
- O agente de materiais prepara uma área de staging local ignorada pelo Git e deve impor um limite de tamanho antes de qualquer upload futuro. Não subir a bibliografia protegida por direitos de autor.

## Dados de origem e qualidade

- Foram encontrados dois APKG locais de Neuroanatomia (essencial/completo) cujos hashes correspondem ao manifesto de materiais. Um ZIP de bibliografia local inclui conteúdos que não devem ser publicados sem direito de distribuição. Os ficheiros MIMED encontrados foram excluídos.
- Três folhas Google Sheets homónimas do compêndio têm 18 colunas: `ID_Unico`, `Capitulo_Numero`, `Capitulo_Nome`, `Subtema`, `Ano_Letivo`, `Tipo_Avaliacao`, `Epoca`, `Numero_Pergunta`, `Fonte_Original`, `Pagina`, `Enunciado`, `Opcoes_Resposta`, `Resposta_Indicada_Drive`, `Resposta_Validada`, `Estado_Validacao`, `Aviso_Erro_Discrepancia`, `Justificacao_Anatomica_FMUP`, `Grau_Confianca`.
- A folha selecionada pelo agente de banco de perguntas tem 1 370 linhas de origem. A primeira importação local continha 1 207 perguntas, das quais 903 marcadas como publicadas e 304 em revisão, mas esta contagem **não deve ser aceite sem nova validação**.
- Auditoria local da primeira migration: todas as 1 207 entradas ficaram como `short_answer`, apesar de haver categorias de escolha múltipla na origem; ano letivo, subtema, época, opções, resposta indicada e confiança ficaram vazios. Os campos avaliação e página/origem tinham valores. Isto impedia filtros fiéis aos campos reais.
- Inspeção direta das folhas encontrou respostas genéricas como “Resolução validada FMUP.” e enunciados truncados mesmo em linhas rotuladas `VALIDADO`/`ALTO`; noutras versões há associação claramente errada entre pergunta e capítulo. O texto de origem pode conter nomes próprios. É obrigatório corrigir ou colocar estas linhas em revisão, anonimizar a proveniência e não apresentar respostas genéricas como soluções validadas.
- Filtros candidatos, sujeitos a cobertura real e moderação: capítulo, subtema, ano letivo, tipo de avaliação, época, fonte, formato de pergunta e presença de solução. Opções de imagem só devem surgir quando houver associação concreta a ficheiros de imagem. Não criar filtros sobre colunas vazias.

## Código em curso

- Materiais: `worker/materials-catalog.ts`, `migrations/0057_materials_catalog_anki.sql`, `scripts/prepare-material-artifacts.mjs`, testes em `tests/materials-catalog.test.mjs`.
- Banco de perguntas: `migrations/0059_question_bank_neuro.sql`, `worker/quizzes.ts`, `components/question-bank-section.tsx`, `components/question-bank-section.module.css`, integração em `components/curricular-unit-catalog.tsx`, `tests/question-bank-neuro.test.mjs`.
- Exportação personalizada PDF/Anki: ainda em desenvolvimento pelos agentes; rever o contrato API, os filtros aplicados no servidor e a concordância com as opções visíveis no UI.
- Salvaguarda R2: `migrations/0060_r2_read_budget.sql`, `worker/r2-read-budget.ts`, `tests/r2-read-budget.test.mjs`, `docs/DEPLOYMENT-CLOUDFLARE.md`.
- O guia `docs/AI-UI-DESIGN-GUIDE.md` foi lido antes das alterações de UI. A UI deve seguir os componentes e tokens existentes.

## Verificações já executadas

- `corepack pnpm exec tsc --noEmit`: passou durante a implementação em 2026-09-21.
- `node --test tests/r2-read-budget.test.mjs tests/question-bank-neuro.test.mjs`: cinco testes passaram numa revisão intermédia. Estes testes ainda não validam a qualidade científica das perguntas.
- O agente de materiais reportou 319 testes e lint a passar antes das alterações mais recentes. Repetir a suite completa após integração.
- O `pnpm run build` local com OpenNext/Cloudflare encontra um bloqueio de plataforma em Windows ARM64 (`workerd Unsupported platform win32 arm64 LE`). Distinguir isto de uma falha de código e validar por CI GitHub/Cloudflare quando houver autorização para publicar.
- `git diff --check` passou numa revisão intermédia. O repositório é público; antes de qualquer push, auditar a migration com conteúdo de perguntas, proveniência e direitos de distribuição.

## Revisão intermédia da exportação PDF

- A nova UI em `components/material-compendium-export.tsx` e o gerador em `lib/material-compendium-pdf.ts` constroem o PDF no navegador, sem upload para R2. Existem controlos para aulas, tipo de cartão, fonte, tema, imagens e soluções.
- Foram assinalados ao agente dois problemas por corrigir: quando não há cartões locais, o botão de criar PDF fica desativado antes de carregar o banco de questões; e a escrita de enunciados longos no PDF pode ultrapassar o fim da página. Verificar as correções e criar uma amostra visual antes de considerar a exportação concluída.
- Não apresentar o filtro “apenas com imagem” se não existirem imagens ligadas aos dados; a folha de compêndio não contém coluna de imagem. Não inferir escolha múltipla apenas pelo nome da avaliação sem opções reais.
- O utilizador rejeitou a primeira capa do PDF, que colocava conteúdo na ordem visual errada e incluía texto técnico. Foi gerada com o gerador de imagens uma nova ilustração editorial de Neuroanatomia e copiada para `public/neuroanatomia-compendio-cover-v2.png`. A integração na primeira página do PDF e a inspeção visual do resultado estão pendentes/atribuídas ao agente de materiais no momento deste registo.

## Estado no limiar de utilização do Codex

- O utilizador pediu publicação deste registo no GitHub quando a janela de cinco horas do Codex chegasse a 8% restante. A consulta seguinte encontrou 6% restante, em 2026-09-21. Foi criada também uma verificação automática de quinze em quinze minutos para redundância.
- Este log é uma passagem de trabalho; o código de funcionalidades continua não publicado e pode estar a ser editado por agentes na worktree. Não fazer merge nem migration remota a partir deste estado.

## Estado de pausa solicitado pelo utilizador

Implementação pausada em 2026-09-21 a pedido do utilizador. Não iniciar novas alterações até nova mensagem.

### Últimos resultados observados

- A nova capa foi gerada e copiada para `public/neuroanatomia-compendio-cover-v2.png`; `lib/material-compendium-pdf.ts` já referencia `COVER_URL` e desenha a capa como imagem de fundo. Falta uma validação visual final da capa gerada dentro de um PDF completo.
- `corepack pnpm exec tsc --noEmit` falhou na última execução em `worker/quizzes.ts`, linhas 300-301: o resultado de D1 é `unknown` e precisa de narrowing antes de aceder a `.results`/campos equivalentes.
- `node --test tests/material-compendium-pdf.test.mjs` teve 1 falha em 2 testes: o loader devolveu `short_answer` para uma linha de teste que espera `multiple_choice`. A regra de classificação tem de usar opções reais/`response_type` da API e o teste/contrato devem ficar alinhados.
- O teste da capa/PDF passou; o teste do loader falhou. Não declarar a exportação concluída enquanto estes pontos não estiverem corrigidos.
- Os agentes de materiais e banco de perguntas atingiram o limite de utilização do Codex e terminaram sem uma revisão final adicional.

### Trabalho pendente para a próxima sessão

1. Corrigir os dois erros TypeScript em `worker/quizzes.ts` e executar novamente TypeScript, testes, lint e build local conforme possível.
2. Corrigir a classificação de tipos do loader de compêndio e acrescentar cobertura para resposta curta, escolha múltipla, imagem e campos ausentes.
3. Verificar que a UI não bloqueia a criação do PDF antes de carregar o banco de perguntas; carregar as opções reais da origem antes de mostrar filtros.
4. Mostrar apenas filtros suportados por dados preenchidos: capítulo, subtema, tipo de avaliação, época, ano letivo e fonte. Não apresentar imagem/escolha múltipla quando não houver dados associados.
5. Excluir ou marcar para revisão respostas genéricas, enunciados truncados, discrepâncias e classificações de capítulo inconsistentes. Não publicar respostas como validadas só porque a folha contém `VALIDADO`.
6. Confirmar que a proveniência não leva nomes próprios, emails, identificadores de estudantes ou material MIMED para o repositório público.
7. Fazer QA visual do PDF com a nova capa e corrigir quebras de página em enunciados/respostas longos.
8. Repetir a suite completa, `git diff --check` e a auditoria de segredos/dados. Só depois avaliar commit/push; não fazer deploy nem migration D1 remota sem autorização e sem cumprir `AGENTS.md`.

### Ponto de retoma

Retomar em `C:\Projetos\gestor-universitario-pr97`, ramo `codex/continue-pr97`, a partir da worktree suja documentada por `git status --short`. Ler primeiro este ficheiro e a issue [#98](https://github.com/paulo1525/gestor-universitario/issues/98), depois corrigir os erros de validação acima. A capa nova está em `public/neuroanatomia-compendio-cover-v2.png`.

## Próximos passos obrigatórios

1. Receber o inventário completo de valores/contagens da folha canónica e corrigir a migration para conservar metadados úteis, sem nomes nem identificadores pessoais.
2. Aplicar uma regra de qualidade conservadora: excluir placeholders, truncamentos e discrepâncias da publicação; expor claramente o estado de revisão. Verificar exemplos por capítulo e por tipo de avaliação.
3. Completar filtros e exportação personalizados. O PDF deve aceitar os campos que existem na origem e opções de inclusão de soluções/referências; o Anki deve permitir aulas, subtemas e tipos de cartão existentes. Gerar tudo sem criar consumo R2 desnecessário.
4. Rever controlo de acesso, moderação, tamanho de resposta, tratamento de erros, acessibilidade e responsive da UI.
5. Executar testes completos, lint, TypeScript e build se possível; fazer QA visual exclusivamente com o plugin Chrome em desktop e mobile.
6. Não executar `wrangler deploy`, não aplicar migrations remotas nem publicar a aplicação a partir deste computador. Seguir o fluxo descrito em `AGENTS.md`. Não subir ficheiros de bibliografia ou dados privados.
7. Atualizar este registo com resultados finais, ficheiros efetivamente alterados, riscos restantes e estado do Git antes de o publicar no GitHub.
