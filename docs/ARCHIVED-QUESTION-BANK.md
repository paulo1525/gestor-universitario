# Banco de questões e Testes e aprendizagem

Arquivados por decisão do responsável do site em 2026-09-30.
Os cinco módulos `quizzes` estão marcados como `retired` em `lib/app-modules.ts`:
não aparecem na navegação ou nos controlos administrativos e as APIs devolvem
`MODULE_DISABLED` antes de consultar perguntas, tentativas ou progresso.

O código de `worker/quizzes.ts`, as páginas de testes, os componentes do banco,
os exportadores e as tabelas D1 ficam preservados. A secção incorporada na ficha
de Neuroanatomia foi removida. O gerador de Anki baseado em perguntas fica
indisponível; os downloads de baralhos já preparados continuam disponíveis.
Não se importaram perguntas dos compêndios para D1.

Os dois PDFs de Neuroanatomia ficam no R2, com metadados em `material_catalog`
(`material_kind=other`, `other_format=compendium`). A migration 0099 regista as
versões com e sem soluções e mantém o acesso autenticado habitual. A revisão
confirmou a integridade, o número de páginas e a correspondência das perguntas;
as soluções preservam o conteúdo original e não são certificadas editorialmente.
O formulário permite enviar novos compêndios para a moderação existente.

Os compêndios abrem diretamente no leitor PDF do navegador, mantendo a rota
autenticada; não carregam o anotador do site. A migration 0100 acrescenta os
compêndios finais de Fisiologia I e o horário de Anatomia Radiológica. A 0101
regista os recursos de Medicina Preventiva e DECIDES I. A 0102 altera apenas
títulos e nomes de descarga de 78 materiais: mantém IDs, chaves R2, checksums,
tamanhos, versões e realces, sem voltar a carregar os objetos existentes.

Uma eventual recuperação do módulo exige uma alteração de código que remova
`retired`, a reativação explícita das configurações e a revisão dos pontos de
entrada/API. Não basta alterar `enabled` na base de dados.
