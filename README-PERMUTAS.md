# Sistema de distribuição e permutas

## Objetivo

O motor deve preservar as turmas atuais sempre que possível e encontrar a melhor distribuição global para os alunos que manifestaram vontade de mudar. Nenhuma preferência garante uma mudança e nenhum cálculo é publicado sem aprovação do Núcleo de Gestão.

## Fluxo oficial

1. Os representantes registam nome, número mecanográfico e indicação `ficar` ou `mudar`.
2. A indicação fica bloqueada para o representante na primeira gravação.
3. O representante submete a turma.
4. Depois da submissão, cada aluno pode confirmar a intenção e ordenar até cinco turmas de destino.
5. O Núcleo de Gestão resolve tickets e corrige os dados auditadamente.
6. No final do prazo, o verificador global identifica bloqueadores e avisos.
7. O sistema cria uma fotografia imutável dos dados.
8. O motor calcula uma proposta versionada.
9. O Núcleo analisa, compara e aprova uma proposta.
10. A aprovação e a publicação são operações separadas.

## Restrições obrigatórias

- Existem exatamente 20 turmas.
- Cada aluno aparece exatamente uma vez.
- Quem prefere ficar permanece na turma de origem.
- Um aluno só pode mudar para uma turma que tenha selecionado.
- A turma atual nunca pode ser um destino.
- Nenhuma turma ultrapassa a capacidade configurada.
- A diferença normal entre a maior e a menor turma não excede três alunos.
- Exceções exigem aprovação e justificação explícitas.
- Um aluno sem solução válida mantém a turma original.
- Tickets bloqueadores impedem o cálculo.

## Preferências e pontuação

Cada aluno pode ordenar até cinco destinos. A otimização recomendada usa:

| Ordem | Pontos |
|---|---:|
| 1.ª escolha | 100 |
| 2.ª escolha | 60 |
| 3.ª escolha | 35 |
| 4.ª escolha | 20 |
| 5.ª escolha | 10 |

O motor otimiza, por ordem:

1. cumprimento de todas as restrições;
2. número de alunos que consegue mudar;
3. primeiras escolhas;
4. escolhas seguintes;
5. equilíbrio final;
6. menor número de movimentos desnecessários;
7. menor número de exceções.

## Tipos de movimento

### Mudança para vaga

Um aluno ocupa uma vaga existente sem desequilibrar a distribuição.

### Permuta direta

Um aluno da Turma A quer a Turma B e um aluno da Turma B aceita a Turma A.

### Ciclo

Exemplo: `T1 → T2`, `T2 → T3`, `T3 → T1`. O motor deve procurar ciclos com mais de três turmas.

### Cadeia com vaga

Uma vaga numa turma permite uma sequência de movimentos, abrindo sucessivamente novas vagas.

## Abordagem algorítmica

O problema deve ser modelado como otimização inteira ou fluxo de custo mínimo:

- cada aluno elegível é um nó de origem;
- cada lugar possível numa turma é um nó de destino;
- uma aresta só existe quando o aluno escolheu essa turma;
- o custo da aresta representa a ordem da preferência;
- restrições globais controlam capacidades, equilíbrio e permanências.

Uma solução baseada apenas em processar alunos por ordem é proibida, porque pode impedir uma solução global melhor e favorecer indevidamente os primeiros registos.

## Desempates

Empates usam uma semente aleatória registada antes do cálculo. Os mesmos dados, regras e semente têm de produzir exatamente o mesmo resultado. A ordem de submissão nunca dá prioridade.

## Fotografias e versões

Cada execução guarda:

- alunos, origens e destinos ordenados;
- estados das turmas;
- capacidades e regras;
- tickets considerados resolvidos;
- pontuação aplicada;
- semente de desempate;
- autor e data;
- resultado e explicações.

Alterar os dados não reescreve um cálculo anterior. É sempre criada uma nova versão.

## Verificador global

São bloqueadores:

- turma por submeter ou reaberta;
- número mecanográfico inválido ou duplicado;
- aluno marcado para mudar sem destinos;
- destino repetido, inexistente ou igual à origem;
- aluno em mais de uma turma;
- ticket de identidade, turma ou preferência ainda pendente;
- capacidade impossível de respeitar.

São avisos:

- desequilíbrio atual superior ao normal;
- turma sem representante;
- exceção previamente autorizada;
- aluno que provavelmente ficará sem solução.

## Tickets

Estados: `Aberto`, `Em análise`, `Informação necessária`, `Aceite`, `Recusado` e `Concluído`.

Uma decisão guarda responsável, resposta, data e histórico. Aceitar um ticket não deve apagar registos. Correções produzem alterações auditadas e, quando necessário, invalidam a fotografia ainda não publicada.

## Revisão e publicação

O painel da proposta deve mostrar movimentos, ciclos, satisfação por ordem, dimensões iniciais e finais e alunos sem solução. Cada colocação deve ter uma explicação legível. O Núcleo pode rejeitar a proposta, corrigir dados e recalcular. Intervenções manuais exigem motivo e nova validação.

## Testes mínimos

- nenhuma mudança;
- vaga simples;
- permuta direta;
- ciclos de 3, 4 e mais turmas;
- cadeia com vaga;
- múltiplas soluções equivalentes;
- aluno sem solução;
- turma cheia;
- dados duplicados;
- ticket bloqueador;
- exceção de capacidade;
- repetição determinística com a mesma semente;
- impossibilidade matemática de cumprir todas as regras.

## Segurança

Permissões e prazos são validados no servidor. Apenas o Núcleo de Gestão e administradores executam, aprovam ou publicam cálculos. A função de visualização de permissões não substitui a sessão real do administrador e deve manter o ator original na auditoria.
