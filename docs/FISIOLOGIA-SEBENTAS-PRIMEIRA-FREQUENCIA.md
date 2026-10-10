# Sebentas de Fisiologia I — 1.ª frequência

Submissão autorizada de sete PDFs de 10/10/2026: seis capítulos e uma compilação integral ainda em construção. O manifesto `data/materials/fisiologia-sebenta-integral-2026.json` regista os tamanhos, SHA-256, páginas e aulas de cada documento; os PDFs ficam no R2 privado.

A migration 0137 coloca os documentos em **Fisiologia I → Sebentas**, identificando a **1.ª frequência** nos títulos, descrições e notas do catálogo. A integral tem 274 páginas, reúne atualmente os capítulos 1 a 6 e indica expressamente que ainda não cobre toda a matéria da frequência. A sebenta anterior de 556 páginas permanece distinta.

| Capítulo | Tema | Páginas | Aulas |
| --- | --- | ---: | --- |
| 1 | Membranas celulares e potenciais de membrana | 39 | T01, P02 |
| 2 | Transdução do sinal | 39 | TP01 |
| 3 | Fisiologia muscular | 50 | T02–T04, P03 |
| 4 | Eletrofisiologia cardíaca e ECG | 66 | T05–T06, P06–P08 |
| 5 | Ciclo cardíaco, sons cardíacos e ecocardiografia | 60 | TP02–TP03, P04–P05, T07, T09 |
| 6 | Regulação da pressão arterial | 29 | TP04 |

As associações usam os códigos das aulas existentes no catálogo de 2026/2027. A integral associa-se apenas às aulas destes capítulos. A publicação permanece acessível a utilizadores autorizados (`public_access=0`) e é registada na auditoria administrativa. O estado `original` identifica o material fornecido; a conferência de SHA-256 comprova a integridade do ficheiro, sem representar uma nova revisão científica.

Antes da aplicação remota: testes, lint e build locais; commit e push pelo fluxo de PR; carregar e conferir os sete objetos R2; só então aplicar a migration. O teste `tests/fisiologia-sebentas.test.mjs` valida a publicação, as associações, a indicação de incompletude, a integridade referencial e a repetição da migration sem duplicação ou alteração dos materiais anteriores.
