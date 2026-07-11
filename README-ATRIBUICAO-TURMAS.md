# Atribuição de turmas e cálculo das colocações

Este documento descreve o funcionamento do cálculo de mudanças e permutas. O cálculo cria sempre uma **proposta**: nenhuma turma é alterada até um administrador aprovar e aplicar essa proposta. Uma proposta aplicada pode ser revertida.

## Dados considerados

Para cada estudante são usados:

- turma atual;
- decisão de ficar ou tentar mudar;
- turmas alternativas, por ordem de preferência;
- rede de apoio indicada numa preferência;
- até seis colegas concretos, pesquisados pelo nome e confirmados pelo número mecanográfico;
- situações excecionais selecionadas e informação adicional;
- turmas ativas e número atual de estudantes em cada turma.

Quem escolhe **Ficar na Turma X** mantém imediatamente a turma atual e não precisa de preencher situações, destinos ou colegas. Quem escolhe mudar permanece na turma atual se nenhuma alternativa válida for possível, salvo situações excecionais que fiquem pendentes de decisão manual.

## Ordem de prioridade

Para cada estudante que pretende mudar, o motor constrói uma lista sem repetições:

1. turma da rede de apoio, quando indicada;
2. turmas dos colegas selecionados, pela ordem em que foram associados;
3. restantes turmas escolhidas pelo estudante, pela ordem original.

A indicação de um colega é uma **prioridade suave**, não uma garantia. O colega serve para favorecer a turma em que está registado. A colocação continua dependente da existência de uma solução global válida.

## Limites e cálculo

Se `Nᵢ` for o número final de estudantes da turma `i`, a proposta só é aceite quando:

`máximo(Nᵢ) - mínimo(Nᵢ) ≤ 3`

O limite superior usado durante a procura é:

`capacidade = menor turma inicial + 3`

O motor percorre os estudantes numa ordem pseudoaleatória determinística, calculada a partir do identificador do estudante e da semente da proposta. Para cada destino:

1. coloca diretamente o estudante se existir capacidade;
2. se a turma estiver cheia, tenta deslocar um ocupante que também queira mudar para uma alternativa válida;
3. permite cadeias e ciclos de permutas, evitando visitar novamente o mesmo estudante;
4. se não conseguir abrir vaga, tenta a preferência seguinte;
5. se nenhuma resultar, mantém a turma de origem.

A mesma semente e os mesmos dados produzem o mesmo resultado. Cada novo cálculo recebe uma nova semente e fica guardado com os dados de entrada e saída para auditoria.

## Situações excecionais

Bullying, discriminação, exclusão, dificuldade grave de integração, outras situações excecionais e notas livres ativam revisão manual. O cálculo pode sugerir uma colocação, mas o Núcleo deve analisar esses casos antes de aplicar a proposta.

## Estados do resultado

- `stayed_by_choice`: decidiu ficar;
- `moved`: foi colocado noutra turma;
- `fallback`: queria mudar, mas permaneceu na origem;
- `manualReview`: requer análise humana;
- `supportMatched`: ficou na turma da rede de apoio;
- `friendMatched`: ficou numa turma associada a um colega indicado;
- `randomized`: participou num desempate/cadeia resolvida pela semente.

## Fluxo administrativo

1. Os representantes preenchem e submetem as turmas dentro do respetivo prazo.
2. Depois desse prazo, os estudantes registam decisões e preferências na janela própria.
3. O verificador bloqueia o cálculo se existirem turmas por submeter, preferências inválidas ou pedidos pendentes.
4. Um administrador calcula a proposta e revê equilíbrios e casos manuais.
5. A proposta é aprovada e aplicada, ou descartada e recalculada.
6. Se necessário, uma aplicação é revertida para restaurar as turmas de origem guardadas no instantâneo.

O ficheiro Excel administrativo exporta decisões, destinos, colegas, situações selecionadas, notas, revisão manual e resultado da distribuição.
