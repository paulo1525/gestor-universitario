# Plano de implementação — expansão do Gestor Universitário

Última atualização: 20 de setembro de 2026

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
| `feat/implementation-orchestration` | Auditoria, protótipos, integração e validação final | Em curso |
| `feat/academic-content-plan` | Informação das unidades curriculares e calendário | Integrado |
| `feat/materials-anki-plan` | Materiais, sumários, bibliografia e Anki | Integrado |
| `feat/community-campus-plan` | Dúvidas, exames, salas, docentes e avisos críticos | Integrado |

## Estado por área

| Área | Estado inicial | Implementação | Testes | Validação visual |
|---|---|---|---|---|
| Auditoria da UI atual | Concluída | — | — | Captura pública concluída; áreas autenticadas aguardam ramo publicado |
| Protótipos visuais | Concluídos | Desktop e mobile definidos | — | Referência aprovada pelo utilizador |
| Informação das unidades curriculares | Parcial | Integrada | 300/300 no ramo funcional | Pendente no ramo consolidado |
| Calendário e ligações às unidades curriculares | Implementado parcialmente | Integrada | 300/300 no ramo funcional | Pendente no ramo consolidado |
| Sumários por aula | Ausente | Integrada | 303/303 no consolidado | Pendente no ramo publicado |
| Bibliografia recomendada recortada | Ausente | Integrada | 303/303 no consolidado | Pendente no ramo publicado |
| Catálogo Anki | Ausente em Materiais | Integrada | 303/303 no consolidado | Pendente no ramo publicado |
| Gerador Anki personalizado | Parcial em Testes | Integrada | 303/303 no consolidado | Pendente no ramo publicado |
| Dúvidas anónimas | Parcial | Integrada | Validação funcional concluída | Pendente no ramo consolidado |
| Envio e transcrição de exames | Parcial | Integrada | Validação funcional concluída | Pendente no ramo consolidado |
| Mapa de salas | Ausente | Integrada | Validação funcional concluída | Pendente no ramo consolidado |
| Diretório de docentes | Ausente | Integrada | Validação funcional concluída | Pendente no ramo consolidado |
| Avisos críticos persistentes | Parcial | Integrada | Validação funcional concluída | Pendente no ramo consolidado |

## Direção visual aprovada

- navegação preta, superfícies claras e dourado usado apenas para foco, seleção e ações principais;
- cabeçalhos com hierarquia tipográfica forte e elevada legibilidade;
- painéis brancos, bordas discretas, raios e sombras retirados dos tokens globais;
- Materiais organizado por `Visão geral`, `Sumários`, `Bibliografia`, `Anki` e `Exames`;
- configurador Anki com tipos de cartão, aulas/tópicos, opções e resumo da seleção;
- versão móvel com cabeçalho compacto, separadores deslocáveis, cartões empilhados e navegação inferior;
- a inspiração aprovada orienta a composição, mantendo os componentes, tokens e regras de acessibilidade do produto.

## Recursos temporários no ramo de trabalho

Os pacotes Anki e o arquivo de bibliografia de Neuroanatomia foram copiados para
`temporary-resources/neuroanatomia/`. O ZIP de bibliografia foi dividido em partes
inferiores a 100 MB e inclui instruções de reconstrução e checksums em `README.md`.
Estes recursos não podem ser apagados sem autorização explícita do utilizador.

## Conteúdo inicial de Neuroanatomia

### Anki

- pacote Essencial: 1 099 cartões e 29 imagens;
- pacote Completo: 1 620 cartões e 29 imagens;
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

## Próxima atualização prevista

O documento será atualizado após a publicação do ramo, a validação visual autenticada e a decisão de integração em `main`.
