# Medição de consultas D1

O contador por pedido é exposto em `x-db-query-count` e em `Server-Timing`. Com `x-debug-db: 1`, o ambiente local regista também a origem SQL. Pedidos HTTP e operações D1 são contabilizados separadamente.

## Diagnóstico inicial

Antes desta alteração, cada endpoint API (exceto `/api/config`) executava `ensureOperationalSchema`: 1 `PRAGMA`, até 14 instruções DDL/seed em `exec`, 22 seeds em `batch` e 2 atualizações de utilizador, antes da consulta útil. O detalhe acrescentava uma consulta por estudante visível e o verificador uma consulta por estudante que pretendia mudar. Em refresh com os efeitos de desenvolvimento repetidos, isto reproduz a ordem de grandeza observada de mais de 250 operações.

## Resultado estrutural

| Página ou operação | Antes | Depois | Redução | SQL útil depois (D1 local) |
|---|---:|---:|---:|---:|
| Refresh inicial/lista de turmas | 83–250+ | 6–7 | 91,6%–97,2% | 6 ms |
| Detalhe de turma (20 estudantes) | 103–270+ | 7–8 | 92,2%–97,0% | 2 ms |
| Interface do representante | 103–270+ | 7–8 | 92,2%–97,0% | 2 ms |
| Painel administrativo | 170–250+ | 10 | 94,1%–96,0% | não medido sem sessão real |
| Verificador de distribuição (400 estudantes) | 144–320+ | 8 | 94,4%–97,5% | 2 ms |
| Gravação de rascunho | 42+ por tecla | 5 por lote | ≥88,1% | contabilizada por `Server-Timing` |
| Submissão de turma | 45+ | 9 | ≥80,0% | contabilizada por `Server-Timing` |
| Aprovação/reabertura | 44+ | 5 | ≥88,6% | contabilizada por `Server-Timing` |

Os intervalos iniciais distinguem uma execução HTTP isolada das repetições observadas no refresh em desenvolvimento. A duração inicial não foi reconstruída com precisão porque o código anterior não tinha tracing; inventar esse valor seria enganador. A contagem final inclui sessão, configuração e endpoint de dados. Não cresce linearmente com o número de estudantes nas leituras: destinos e contagens usam `JOIN/GROUP BY`.

Os planos locais confirmam `idx_class_students_class_active`, `idx_destinations_student_rank` e o índice `UNIQUE` de `student_number`. Não existe cache global de sessões ou dados pessoais; só há deduplicação, no cliente, da configuração pública durante a montagem da aplicação.
