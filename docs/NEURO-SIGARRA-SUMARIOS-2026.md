# Sumários SIGARRA de Neuroanatomia — 2026/2027

A migration 0139 acrescenta os cinco sumários em falta no `Conteudos.zip` fornecido pelo utilizador em 10/10/2026: **AT7, AT8, AT9, AP5 e AP6**. Os onze documentos já presentes (AT1–AT6, AP1–AP4 e plano curricular) têm os mesmos SHA-256 e tamanhos; não são duplicados. O exame incluído no ZIP não faz parte desta importação de sumários.

O manifesto `data/materials/neuro-sigarra-sumarios-2026.json` regista origem, páginas, tamanho e SHA-256 dos PDFs. Os ficheiros ficam no R2, em chaves imutáveis pelo hash, e apenas os metadados entram no Git. A publicação segue a categoria **Sumários**, formato `lecture`, estado `original` e a política de acesso público dos sumários oficiais já existentes.

| Aula | Tema | Páginas |
| --- | --- | ---: |
| AT7 | Nervos trigémio e facial | 4 |
| AT8 | Nervos glossofaríngeo, vago, acessório e hipoglosso | 4 |
| AT9 | Cerebelo | 5 |
| AP5 | Nervos glossofaríngeo, vago, acessório e hipoglosso. Espaços comuns ao crânio e à face | 8 |
| AP6 | Cerebelo. Diencéfalo. Hipófise | 3 |

O plano curricular oficial de 2026/2027 identifica AT9 como Cerebelo e AT10 como Diencéfalo e hipófise. A migration corrige estes dois rótulos anteriormente invertidos e completa o nome genérico de AP6, apenas se os valores anteriores conhecidos ainda estiverem presentes. Preserva os IDs, códigos e associações dos materiais anteriores.

Antes da aplicação remota: testes, lint e build locais; carregamento e conferência dos cinco objetos R2; commit e push por PR; aplicação da migration D1. O teste `tests/neuro-sigarra-summaries.test.mjs` valida o âmbito, as associações, a repetição sem duplicação, a preservação de documentos anteriores e de rótulos revistos manualmente, unidades inativas e integridade referencial. A operação fica registada em `admin_audit_log`.
