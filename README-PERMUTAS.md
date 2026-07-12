# Sistema de distribuição e permutas

## Estado atual

A aplicação recolhe e valida os dados e permite ao Núcleo calcular uma proposta versionada. O cálculo nunca altera imediatamente as turmas: casos sensíveis têm revisão obrigatória, a proposta é aprovada, aplicada internamente e só depois publicada. Os dados de entrada são protegidos por hash; qualquer alteração posterior obriga a um novo cálculo.

## Fluxo

1. O representante indica, para cada estudante, se pretende ficar ou mudar e submete a turma.
2. Depois do encerramento da formação inicial, o estudante confirma que fica ou escolhe alternativas.
3. O estudante pode ordenar qualquer quantidade entre 1 e 19 turmas alternativas, sem repetições.
4. A turma atual não é repetida na lista: é sempre o resultado de segurança e constitui o 20.º resultado possível.
5. Se nenhuma alternativa for viável, o estudante permanece na turma atual. Um cálculo nunca pode deixar um estudante sem turma.
6. O Núcleo resolve pedidos pendentes, executa o verificador e calcula uma proposta.
7. Uma proposta deve ser revista e aprovada antes de ser aplicada; propostas antigas ficam invalidadas quando se calcula outra.
8. Uma nota ou situação sensível sinaliza o estudante e bloqueia a aprovação até o Núcleo validar expressamente o caso.
9. Depois de aplicada, a proposta pode ser revertida ou publicada. A publicação é a fase que torna a distribuição final.

## Preferências

- A ordem é significativa: a 1.ª turma é a mais desejada.
- A interface permite acrescentar, remover, subir e descer opções.
- Não é obrigatório preencher todas as alternativas.
- A turma atual, para quem quiser mudar, deverá ser a última opção. Por exemplo: queria mudar para a 3ª, 7ª ou 9ª turmas; se não entrar em nenhuma delas, fico na minha atual.
- Guardar novamente substitui a lista anterior numa única operação.
- As preferências não garantem uma mudança.
- Quem não submete o formulário permanece automaticamente na turma de origem.
- O Núcleo pode registar preferências em nome de um estudante antes do cálculo, sempre com justificação e auditoria.
- Cada destino pode ter no máximo uma pessoa de referência. A referência vale um ponto apenas se essa pessoa permanecer nessa turma.
- Dificuldades graves de integração ou bullying valem dois pontos de desempate.
- Outra situação excecional tem de ser avaliada pelo Núcleo, que atribui entre zero e cinco pontos e regista a justificação.
- Os pontos desempatem estudantes dentro da mesma posição de preferência; nunca reordenam os destinos escolhidos.

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
- situação excecional ainda não avaliada pelo Núcleo.

Referências que deixaram de permanecer na turma indicada aparecem como aviso e não atribuem pontos. A revisão e edição das colocações decorrem na secção administrativa própria **Colocações**, com grelha, filtros, overrides justificados e controlo das fases de cálculo, aprovação, aplicação e publicação.

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
