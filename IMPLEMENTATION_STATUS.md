# Plano de implementação — expansão do Gestor Universitário

Última atualização: 22 de setembro de 2026

## Objetivo

Implementar e integrar, sem publicação parcial em produção, as seguintes áreas:

1. informação estruturada das unidades curriculares;
2. materiais por aula, incluindo sumários e bibliografia recomendada recortada;
3. catálogo e gerador de baralhos Anki;
4. dúvidas e sugestões anónimas;
5. submissão e tratamento de fotografias e questões de exames;
6. mapa de salas e diretório de docentes;
7. avisos críticos com confirmação persistente;
8. integração com calendário, pesquisa, notificações e histórico.

## Fluxo de trabalho

```text
auditoria visual da versão atual
  -> protótipos das novas áreas
  -> implementação em três ramos isolados
  -> integração no ramo de orquestração
  -> migrations locais
  -> testes, lint e build
  -> validação visual em computador e telemóvel
  -> pull request para main
  -> checks obrigatórios
  -> migrations D1 remotas
  -> publicação automática pela Cloudflare
```

Não é permitido publicar diretamente com `wrangler deploy`. A produção é atualizada apenas através do merge protegido em `main`.

## Ramos de trabalho

| Ramo | Âmbito | Estado |
|---|---|---|
| `release/consolidate-site-changes` | Consolidação final das alterações pendentes na PR #109 | Em validação sobre a `main` após as PRs #105 e #108 |
| `feat/academic-content-plan` | Informação das unidades curriculares e calendário | Integrado |
| `feat/materials-anki-plan` | Materiais, sumários, bibliografia e Anki | Integrado |
| `feat/community-campus-plan` | Dúvidas, exames, salas, docentes e avisos críticos | Integrado |

## Estado por área

| Área | Estado inicial | Implementação | Testes | Validação visual |
|---|---|---|---|---|
| Auditoria da UI atual | Concluída | — | — | Captura pública concluída; áreas autenticadas aguardam ramo publicado |
| Protótipos visuais | Concluídos | Desktop e mobile definidos | — | Referência aprovada pelo utilizador |
| Informação das unidades curriculares | Parcial | Integrada; docentes associados visíveis no detalhe e capas editoriais nos cartões das 11 UCs do 2.º ano | 338/338 no ramo de orquestração | Pendente no ramo publicado |
| Calendário e ligações às unidades curriculares | Implementado parcialmente | Integrada; eventos ligam à UC e pesquisam o local no diretório | 311/311 no consolidado | Pendente no ramo publicado |
| Sumários por aula | Ausente | Integrada; filtros por aula, estado e recomendação | 306/306 no consolidado | Pendente no ramo publicado |
| Bibliografia recomendada | Ausente | Metadados e páginas integrados; o leitor PDF com realces privados só abre ficheiros autorizados e prontos no R2 | 347/347 no consolidado | Pendente no ramo publicado |
| Catálogo Anki | Ausente em Materiais | Downloads diretos de artefactos pré-gerados, publicados e prontos | 347/347 no consolidado | Pendente no ramo publicado |
| Gerador Anki personalizado | Parcial em Testes | Retirado da interface de Materiais para evitar geração intensiva no dispositivo | 347/347 no consolidado | Substituído por pacotes versionados |
| Dúvidas anónimas | Parcial | Integrada | Validação funcional concluída | Pendente no ramo consolidado |
| Envio e transcrição de exames | Parcial | Integrada; transições sequenciais e idempotentes validadas | 311/311 no consolidado | Pendente no ramo publicado |
| Mapa de salas | Ausente | Integrada; resultados incluídos na pesquisa global | 311/311 no consolidado | Pendente no ramo publicado |
| Diretório de docentes | Ausente | Integrada; pesquisa global e ligações a partir das UC | 311/311 no consolidado | Pendente no ramo publicado |
| Avisos críticos persistentes | Parcial | Integrada; confirmação permitida a estudantes elegíveis | 306/306 no consolidado | Pendente no ramo publicado |

## Direção visual aprovada

- navegação preta, superfícies claras e dourado usado apenas para foco, seleção e ações principais;
- cabeçalhos com hierarquia tipográfica forte e elevada legibilidade;
- painéis brancos, bordas discretas, raios e sombras retirados dos tokens globais;
- capas verticais das UCs com fundo marfim, ilustração anatómica em azul-acinzentado e apontamentos dourados, reutilizadas no catálogo e nos PDFs sem duplicar artefactos;
- Materiais organizado por `Visão geral`, `Sumários`, `Bibliografia`, `Anki` e `Exames`;
- configurador Anki com tipos de cartão, aulas/tópicos, opções e resumo da seleção;
- versão móvel com cabeçalho compacto, separadores deslocáveis, cartões empilhados e navegação inferior;
- a inspiração aprovada orienta a composição, mantendo os componentes, tokens e regras de acessibilidade do produto.

## Recursos temporários no ramo de trabalho

Os pacotes Anki e o arquivo de bibliografia de Neuroanatomia permanecem preservados
em `temporary-resources/neuroanatomia/` no checkout local. O ZIP de bibliografia foi
dividido em partes inferiores a 100 MB e inclui instruções de reconstrução e
checksums em `README.md`. Apenas o manifesto é versionado. Os binários originais
permanecem arquivados e fora do fluxo de publicação por conterem media ou recortes
sem autorização de distribuição. Estes recursos não podem ser apagados sem
autorização explícita do utilizador.

## Conteúdo inicial de Neuroanatomia

### Anki

- pacote Essencial original: 1 099 cartões e 29 imagens, preservado mas não distribuído;
- pacote Completo original: 1 620 cartões e 29 imagens, preservado mas não distribuído;
- organização por AT1–AT5, AP1–AP3 e subtópicos;
- modelos de resposta curta, identificação prática por imagem e escolha múltipla gerada a partir do banco de Testes.

### Sumários e bibliografia

- 9 ficheiros originais, incluindo o plano curricular provisório;
- 4 versões verificadas de AT1 e AT3;
- 32 excertos bibliográficos;
- mapa entre páginas impressas e páginas físicas;
- preservação simultânea dos originais e das versões corrigidas;
- deduplicação dos excertos comuns a várias aulas.

## Decisões técnicas

- D1 guarda metadados, estados, relações e histórico.
- Ficheiros grandes devem usar armazenamento de objetos; não devem ser convertidos em data URLs na D1.
- PDFs e pacotes Anki são pré-gerados, versionados e transmitidos diretamente do R2; pedidos de estudantes não executam geração binária.
- Um artefacto só pode ser descarregado quando estiver publicado, pronto, validado por checksum e autorizado para distribuição.
- Realces de PDF são uma camada privada na D1, identificada por utilizador, material, página e coordenadas normalizadas; o PDF original nunca é alterado.
- Originais, versões verificadas e versões históricas nunca são substituídos silenciosamente.
- Materiais submetidos continuam sujeitos a moderação.
- Informação académica não confirmada aparece como `A validar`.
- Revelações excecionais de identidade em submissões anónimas exigem autorização restrita, justificação e auditoria.
- Acesso a excertos bibliográficos fica reservado a utilizadores autenticados e sujeito à validação das permissões de disponibilização.

## Critérios globais de conclusão

- migrations executáveis numa base vazia e numa base atualizada;
- APIs autenticadas, autorizadas e auditadas;
- testes automáticos sem regressões;
- `pnpm lint` sem erros;
- `pnpm run build` concluído;
- validação visual das páginas principais em computador e telemóvel;
- navegação, pesquisa, notificações e gestão de módulos atualizadas;
- nenhuma credencial, dado pessoal real ou binário de grandes dimensões versionado;
- documentação de configuração externa necessária para armazenamento de objetos;
- pull request integrada apenas depois de todos os checks obrigatórios passarem.

## Registo de validação

| Data | Verificação | Resultado |
|---|---|---|
| 20/09/2026 | Suite da `main` antes das alterações | 295/295 testes aprovados |
| 20/09/2026 | Sincronização com `origin/main` | Commit base `80d02b0` |
| 20/09/2026 | Preparação local da D1 | Migrations 0056–0058 e seed local concluídos |
| 20/09/2026 | Protótipos de Materiais/Anki | Desktop e mobile aprovados como direção visual |
| 20/09/2026 | Integração de conteúdo académico | Commit funcional integrado; testes, TypeScript, lint e build aprovados no ramo de origem |
| 20/09/2026 | Integração de comunidade e campus | Commit funcional integrado; TypeScript aprovado no ramo consolidado |
| 20/09/2026 | Integração de Materiais e Anki | Catálogo, tabs, builder e fallback R2 integrados |
| 20/09/2026 | Validação consolidada | 303/303 testes, TypeScript, ESLint e build Next.js aprovados |
| 20/09/2026 | Publicação do ramo | Ramo enviado ao GitHub e PR draft #97 criada |
| 21/09/2026 | Confirmação persistente de avisos | Estudantes elegíveis podem confirmar avisos publicados, visíveis e não expirados |
| 21/09/2026 | Docentes nas unidades curriculares | API e página de detalhe apresentam docentes ativos, contactos e gabinete |
| 21/09/2026 | Aperfeiçoamento de Materiais | Filtros, estados editoriais, metadados bibliográficos, URLs externas e acessibilidade integrados |
| 21/09/2026 | Validação consolidada | 306/306 testes, TypeScript, ESLint, build Next.js e build OpenNext/Cloudflare aprovados localmente |
| 21/09/2026 | Build remoto da PR #97 | A integração Cloudflare reportou falha após o commit remoto anterior; a causa não é reproduzível no build local e os logs detalhados exigem acesso ao painel Cloudflare |
| 21/09/2026 | Fluxo de transcrição de exames | Transições limitadas a etapas adjacentes, com repetição idempotente e resposta 409 para saltos inválidos |
| 21/09/2026 | Integração do calendário | Unidades curriculares e locais físicos ligam ao respetivo detalhe e ao diretório de salas |
| 21/09/2026 | Integração da pesquisa | Edifícios, salas e docentes ativos passam a integrar a pesquisa global com etiquetas bilingues |
| 21/09/2026 | Validação consolidada | 311/311 testes, TypeScript, ESLint, build Next.js e build OpenNext/Cloudflare aprovados localmente |
| 21/09/2026 | Nova tentativa remota da PR #97 | A integração Cloudflare voltou a falhar no commit `8df7c06e`; o build OpenNext local continua aprovado, reforçando o bloqueio de configuração/provisionamento remoto |
| 21/09/2026 | Auditoria de qualidade/infra | Separada a compilação OpenNext das migrations D1 remotas; o destino da migration passou a ser explícito, o binding `MATERIALS_BUCKET` foi declarado no Worker e o fallback R2 ficou documentado |
| 21/09/2026 | Aperfeiçoamento do diretório de Campus | Edifícios, salas, mapas, acessibilidade e docentes associados a unidades curriculares passaram a ter apresentação responsiva e editor administrativo acessível |
| 21/09/2026 | Aperfeiçoamento de Materiais/Anki | Navegação por separadores com teclado, estados de erro e repetição, cancelamento de pedidos obsoletos, proteção contra seleções Anki vazias e adaptação móvel a 390 px |
| 21/09/2026 | Validação consolidada após três frentes Luna Max | 318/318 testes, TypeScript, ESLint, build Next.js e build OpenNext/Cloudflare aprovados localmente |
| 22/09/2026 | Retoma após integração da PR #97 | Ramo `feat/implementation-orchestration` recriado a partir de `main` no commit `28232ac`; recursos temporários preservados |
| 22/09/2026 | Downloads de baixo custo e leitor PDF | Removida a geração de PDF/APKG da interface de Materiais; downloads passam a usar apenas artefactos preparados e o leitor guarda realces privados na D1 através da migration 0063 |
| 22/09/2026 | Validação do leitor e downloads | 337/337 testes, TypeScript, build Next.js e build OpenNext/Cloudflare aprovados; ESLint sem erros e com um aviso preexistente em `components/documents-library.tsx` |
| 22/09/2026 | Consolidação das PRs pendentes | PR #109 recebeu os realces PDF, downloads preparados e capas das onze UCs sem reabrir PRs antigas nem expor os artefactos protegidos |
| 22/09/2026 | Validação intermédia da consolidação | 347/347 testes aprovados após resolução dos conflitos de Materiais e integração das capas |
| 22/09/2026 | Validação final da PR #109 consolidada | 347/347 testes, TypeScript, ESLint, build Next.js e build OpenNext/Cloudflare aprovados; avisos duplicados de tradução removidos |
| 22/09/2026 | Capas das unidades curriculares | As 11 capas verticais do 2.º ano passam a aparecer nos cartões das UCs; o registo visual foi separado do gerador PDF para não carregar processamento binário no catálogo |
| 22/09/2026 | Validação das capas no catálogo | 338/338 testes, TypeScript, build Next.js e build OpenNext/Cloudflare aprovados; ESLint sem erros e com o aviso preexistente em `components/documents-library.tsx` |

## Bloqueios antes de `main`

1. gerar e enviar para o R2 apenas novos artefactos cuja distribuição esteja autorizada; os binários originais protegidos permanecem arquivados;
2. executar QA visual autenticado em desktop e mobile no ramo publicado;
3. confirmar no painel Cloudflare o resultado do build após a separação das migrations e o provisionamento do bucket R2;
4. aplicar as migrations D1 remotas 0056–0058;
5. aplicar a migration D1 0063 apenas depois de revisão e imediatamente antes da integração correspondente;
6. validar o alinhamento dos realces em PDFs com diferentes proporções no Chrome autenticado, em computador e telemóvel;
7. confirmar que cada pacote pré-gerado tem checksum, versão e autorização de direitos antes de marcar o objeto como `ready`;
8. concluir os checks obrigatórios da PR #109 e confirmar o build remoto da Cloudflare.
8. validar no Chrome autenticado o recorte das 11 capas nos cartões das UCs em desktop e a 390 px.

## Próxima atualização prevista

O documento será atualizado após o build completo, os checks da PR #109, a validação visual autenticada do leitor PDF e a integração protegida em `main`.
