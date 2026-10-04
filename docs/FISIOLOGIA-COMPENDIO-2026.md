# Compêndio de Fisiologia I · 2026/27

A classificação curricular conserva os 1195 identificadores e o conteúdo da base canónica do projeto FMUP_Med. O catálogo contém 20 aulas teóricas, 13 teórico-práticas e 27 práticas. Duas questões de embriologia ficam sem correspondência curricular confirmada; aulas sem questões continuam identificadas no catálogo.

Os PDFs contêm 1190 questões com opções de escolha múltipla, incluindo os avisos de revisão da fonte. O banco de testes mantém as 1106 questões previamente publicadas e validadas. O novo baralho **Fisiologia - Compêndio** contém 1111 cartões: o seu relatório documenta as 84 exclusões e a interpretação das chaves de resposta. Os restantes baralhos não são ativados por estas migrations.

As frequências separam as aulas antes e depois de 4 de novembro. As práticas têm datas por semana, não por turma; P14/P15 pertencem à semana de 2 de novembro, que atravessa a primeira frequência. Essa fronteira é uma aproximação explícita da classificação. A duração de 60 minutos foi indicada pelo utilizador; não está publicada nos documentos de avaliação consultados.

A simulação seleciona 50 questões por quotas equilibradas entre as aulas com perguntas disponíveis. A ordem dentro de cada aula varia, e aulas pequenas cedem a sua quota restante às outras. Permite treino sem limite de tempo.

## Reprodução

Na pasta `Compendio` do projeto académico, executar os geradores `consolidar_classificacao_aulas.py`, `gerar_documentos_estudo.py` e `gerar_ankis_compendio.py`. Os relatórios e hashes ficam junto das entregas. Não copiar fontes académicas privadas para o repositório da aplicação.

Neste repositório, `node scripts/prepare-fisiologia-lessons.mjs <ficheiro-base-canónica.json>` reproduz a migration 0119. `node scripts/prepare-fisiologia-materials.mjs <pasta-Compendio>` valida os ficheiros e reproduz a migration 0120, os metadados públicos e um manifesto operacional no projeto académico.

Os três objetos R2 referidos em `data/materials/fisiologia-compendio-2026.json` foram verificados por tamanho e SHA-256 antes da migration 0121. Esta só ativa os registos que correspondem aos objetos verificados. A organização altera os tópicos das questões existentes, sem substituir questões nem snapshots de testes anteriores.

## Validação

Os testes cobrem IDs preservados, formatos, quotas por aula, duração, isolamento das estatísticas, permissões de afixação, amostra mínima das perguntas mais erradas e histórico de perguntas vistas. O cronómetro, a configuração, a navegação e os comentários foram verificados no Chrome em desktop e telemóvel.

O pacote Anki foi validado estruturalmente e o JavaScript de escolha múltipla foi revisto. A execução visual no cliente Anki permanece por confirmar: a política do navegador bloqueou a pré-visualização HTML local.
