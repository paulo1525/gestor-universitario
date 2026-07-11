# Sistema de distribuição e permutas

## Estado atual

A aplicação recolhe e valida os dados necessários para uma futura distribuição automática. O motor que altera as colocações não é executado enquanto o Núcleo de Gestão não definir as regras académicas de capacidade, equilíbrio, prioridades e desempate. O **Verificador de distribuição** pode ser usado entretanto para detetar dados em falta ou inconsistentes.

## Fluxo

1. O representante indica, para cada estudante, se pretende ficar ou mudar e submete a turma.
2. Depois do encerramento da formação inicial, o estudante confirma que fica ou escolhe alternativas.
3. O estudante pode ordenar qualquer quantidade entre 1 e 19 turmas alternativas, sem repetições.
4. A turma atual não é repetida na lista: é sempre o resultado de segurança e constitui o 20.º resultado possível.
5. Se nenhuma alternativa for viável, o estudante permanece na turma atual. Um cálculo nunca pode deixar um estudante sem turma.
6. O Núcleo resolve pedidos pendentes, executa o verificador e, futuramente, calcula uma proposta.
7. Uma proposta deve ser revista e aprovada antes de ser aplicada.
8. O formulário deverá ter uma opção de 'Notas', em que, se o estudante escrever algo (deve ter um aviso para só escrever em casos especiais, tipo sofre bullying ou não se encaixa na turma), esse estudante fica sinalizado. O sistema pode atribuir-lhe automaticamente uma turma, mas o núcleo da CC terá de validar manualmente esse estudante.

## Preferências

- A ordem é significativa: a 1.ª turma é a mais desejada.
- A interface permite acrescentar, remover, subir e descer opções.
- Não é obrigatório preencher todas as alternativas.
- A turma atual, para quem quiser mudar, deverá ser a última opção. Por exemplo: queria mudar para a 3ª, 7ª ou 9ª turmas; se não entrar em nenhuma delas, fico na minha atual.
- Guardar novamente substitui a lista anterior numa única operação.
- As preferências não garantem uma mudança.

## Garantias que já estão implementadas

- identificação única por número mecanográfico;
- estudante associado a uma única turma ativa;
- destinos válidos, distintos e ordenados;
- fallback explícito para a turma de origem;
- submissão e decisões administrativas idempotentes;
- permissões e prazo validados no servidor;
- alterações relevantes registadas no histórico;
- carregamento e gravação em lote, sem consultas por estudante.

## Modelo recomendado para o futuro motor

O cálculo deve analisar a solução global, em vez de processar estudantes um a um. Um modelo de fluxo de custo mínimo ou otimização inteira permite representar:

- mudanças para vagas;
- permutas diretas;
- ciclos entre várias turmas;
- cadeias iniciadas por uma vaga;
- permanência na origem quando não existe solução.

Cada execução deverá criar uma fotografia versionada dos dados, regras e resultados. Com os mesmos dados, regras e critério de desempate, o resultado deve ser reproduzível.

## Núcleo de Gestão

- capacidade mínima e máxima de cada turma;
- Resposta do núcleo: não há máximo nem mínimo - só não pode haver diferença superior a 3 estudantes entre as turmas de menores e maiores dimensões.
- desequilíbrio permitido entre turmas;
- critério para comparar uma 1.ª escolha com várias escolhas inferiores;
- política de desempate: vai ser por aleatorização do sistema, mas sempre SEMPRE registando isto tudo em logs.
- tratamento de exceções administrativas;
- momento em que uma proposta aprovada é publicada aos estudantes.
- Este momento é apenas no fim de todas as turmas tarem validadas manualmente pelo núcleo.

Estas regras não são inferidas pelo código, porque são decisões académicas. Até serem definidas, o verificador prepara os dados, mas não altera colocações.

## Verificador de distribuição

Quando o sistema for rodado pela primeira vez pelos admins, pode dar para voltar atrás e reverter todas as alterações. Casos por aleatorização ou assim que mereçam atenção devem ficar registados devidamente em logs visíveis para os admins. Pessoas com "Notas" ou aleatorizadas devem tar a cores diferentes. Quem mudou para o que queria deve ficar a verde e quem permaneceu na msema turma por vontade própria deve ficar a cinzento estilo bloqueado.

São bloqueadores atuais:

- turma em rascunho ou reaberta;
- número mecanográfico inválido;
- estudante que quer mudar sem preferências;
- pedido de alteração pendente.

O verificador apresenta avisos sobre distribuição atual, mas um aviso não autoriza automaticamente movimentos.

## Testes necessários antes de ativar o motor

- nenhuma mudança possível;
- vaga simples;
- permuta direta;
- ciclos com 3 ou mais turmas;
- cadeia com vaga;
- estudante sem alternativa viável, permanecendo na origem;
- várias soluções equivalentes;
- limites de capacidade definidos pelo Núcleo;
- repetição determinística do mesmo cálculo;
- aprovação e aplicação idempotentes;
- rollback administrativo de uma proposta ainda não publicada.
