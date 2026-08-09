# Guia visual obrigatório para IAs

Este documento define a linguagem visual do Gestor Universitário. Deve ser lido antes de criar ou alterar qualquer página, painel, cartão, formulário, tabela, modal ou estado vazio.

## Referências canónicas

A identidade visual não deve ser reinventada por módulo. Antes de escrever CSS, abrir e comparar no Chrome:

1. `/admin/` — referência principal para páginas de gestão administrativa.
2. A implementação de `components/admin-control.tsx` — cabeçalhos, indicadores, painéis e formulários administrativos.
3. A implementação de `components/turmas-dashboard.tsx` — cabeçalhos de página, cartões de estatística, filtros, tabelas e estados.
4. Os componentes e tokens de `app/globals.css` — fonte de verdade para cores, espaçamento, raio, sombra, botões e campos.
5. As primitivas de `components/admin-ui.tsx` — fonte de verdade para a estrutura de páginas, métricas, secções, navegação, barras de ferramentas, formulários e regiões de dados administrativas.

Uma página nova deve parecer parte destas áreas à primeira vista. Uma inspiração externa pode orientar o fluxo e a interação, mas nunca substituir o tema visual da plataforma.

## Arquitetura da administração

- A administração é um espaço de trabalho separado. O acesso administrativo não é um módulo académico e não deve ser misturado com as ligações principais dos estudantes.
- `/admin/` é exclusivamente a consola inicial: apresenta um resumo compacto e encaminha para áreas de trabalho. Não contém formulários extensos, tabelas de edição ou várias ferramentas abertas em simultâneo.
- Cada tarefa tem uma rota própria. Consultar utilizadores, configurar a plataforma, gerir testes e gerir unidades curriculares não podem coexistir na mesma página.
- A navegação administrativa agrupa destinos por domínio: conteúdo académico, pessoas e acessos, acompanhamento e plataforma. Não ordenar ligações apenas pela data em que foram criadas.
- O menu administrativo pode revelar ligações secundárias de forma progressiva, mas o destino atual e o respetivo grupo devem permanecer identificáveis.
- Deve existir uma ação clara para regressar à aplicação sem apresentar opções administrativas a utilizadores sem permissão.
- Uma inspiração como o XenForo pode orientar a hierarquia e a densidade; o resultado mantém sempre as superfícies claras, os tokens e a identidade do Gestor Universitário.

## Composição obrigatória das páginas administrativas

Usar as primitivas exportadas por `components/admin-ui.tsx` antes de criar estrutura local:

1. `AdminPage` define o ritmo vertical e a largura de trabalho.
2. `AdminPageHeader` contém uma eyebrow, um único `h1`, descrição curta opcional e no máximo uma ação primária.
3. `AdminMetricGrid` e `AdminMetric` apresentam apenas números ou estados que ajudam a decidir a próxima ação.
4. `AdminSection` agrupa uma tarefa coerente; `AdminNavigationList` representa destinos e não cartões promocionais.
5. `AdminToolbar` reúne pesquisa, filtros e ações em lote numa única faixa.
6. `AdminDataRegion` envolve uma tabela ou lista extensa sem criar um segundo painel visual.
7. `AdminFormGrid` organiza campos; ações de gravação pertencem ao rodapé da secção, não a cada campo.
8. `AdminEmptyState` é reservado a ausência real de dados ou resultados, nunca a instruções introdutórias.

Uma página pode omitir níveis desnecessários. Não deve embrulhar uma destas primitivas noutra superfície equivalente nem criar cartões dentro de cartões.

### Contrato verificável dos cartões administrativos

- Em rotas `/admin/`, cabeçalhos de página usam exclusivamente `AdminPageHeader`.
- Uma superfície de conteúdo usa `AdminSection`; um indicador usa `AdminMetric`; um destino usa `AdminNavigationItem`. Não criar equivalentes locais para estes três padrões.
- Secções colocadas na mesma linha através de `AdminSectionGrid` têm sempre a mesma altura, independentemente da quantidade de ligações ou texto.
- Pesquisa e filtros pertencem a `AdminToolbar`; ausência de dados ou resultados pertence a `AdminEmptyState`.
- É proibido usar `.panel`, `.panel__header` ou `.empty-state` legados em novas páginas administrativas ou introduzi-los numa página administrativa migrada.
- É proibido acrescentar barras coloridas no topo, raios, sombras ou paddings locais à estrutura de `AdminSection`, `AdminMetric` e `AdminNavigationItem`.
- Qualquer exceção exige alteração explícita deste guia e do teste `tests/ui-theme-governance.test.mjs`; não pode surgir apenas num CSS Module local.

## Escala e alinhamento administrativo

- Intervalo entre blocos principais: `var(--space-5)`; em mobile, `var(--space-4)`.
- Espaçamento interior normal: `var(--space-4)`; formulários densos podem usar `var(--space-5)`.
- Cabeçalho de secção: 72 px no desktop e pelo menos 66 px no mobile.
- Ícone de secção: 38 px; ícone de métrica: 42 px; ícone de uma linha de navegação: 34 px.
- Painéis usam `var(--radius-panel)`, `var(--color-border)`, `var(--color-surface)` e `var(--shadow-panel)`.
- Controlos usam `var(--control-height)`, `var(--radius-control)` e `var(--focus-ring)`.
- Títulos, descrições, filtros e colunas que desempenham a mesma função devem começar no mesmo eixo em todas as páginas.
- Texto auxiliar deve caber numa frase. Se forem necessárias instruções longas, usar ajuda contextual ou documentação separada.

## Regra de reutilização

Fora das rotas administrativas, usar primeiro as classes globais existentes, em especial:

- `page-heading`, `page-heading--simple`, `admin-heading`;
- `eyebrow`;
- `stats-grid`, `stat-card` e variantes de `stat-card__icon`;
- `panel`, `panel__header`, `panel-tools` (apenas em superfícies legadas fora de `/admin/`);
- `admin-stats`, `admin-settings`, `admin-settings__header`, `admin-settings__icon`;
- `button`, `button--primary`, `button--secondary`, `button--ghost`;
- `search-field`, `select-field`, tabelas e estados vazios existentes.

O CSS Module de uma página deve conter apenas o que é específico dessa página. Não copiar nem recriar o sistema base dentro do módulo.

### Contrato partilhado das superfícies

- Painéis públicos e primitivas administrativas consomem os tokens `--surface-card-*` e `--surface-header-*` definidos em `app/globals.css`; um CSS Module não fixa uma segunda combinação de borda, raio, sombra ou cabeçalho.
- `AdminSection` e `AdminMetric` expõem `data-platform-surface`; cabeçalhos de secção expõem `data-platform-surface-header`. Estes atributos são o ponto de integração estável entre as primitivas React e os temas.
- O tema base mantém cabeçalhos claros sem decoração adicional. O tema azul pode usar o seu filete azul funcional através de `--surface-header-accent-*`, sem alterar a anatomia ou a densidade do cartão.
- Uma coleção extensa vive dentro de uma única superfície. Cada registo é uma linha separada por borda, sem raio ou sombra próprios, como em Avisos e comunicados.
- Cartões verdadeiramente autónomos, como métricas e destinos, preservam borda, raio e sombra partilhados; tabelas, formulários e listas não devem ser forçados a parecer cartões promocionais.
- A ação que abre um editor pode ser primária. No estado aberto, “Fechar editor”/“Fechar” é sempre uma ação secundária compacta e troca o ícone de adição por um ícone de fecho.

## Navegação lateral

- A navegação é infraestrutura global, não uma área para experiências visuais de cada módulo.
- O modo expandido mantém logótipo, títulos e descrições; o modo recolhido mantém apenas ícones com nomes acessíveis e tooltips.
- Recolher a navegação tem de libertar efetivamente largura para a área de trabalho e a preferência deve persistir sem guardar dados pessoais.
- Em ecrãs móveis a navegação continua a ser um drawer de largura completa útil; a preferência de desktop não pode transformá-la numa coluna estreita.
- O botão de recolher/expandir deve permanecer visível, ter foco claro, `aria-label`, estado anunciado e uma área de toque de pelo menos 40 px.
- Não acrescentar barras de scroll decorativas ou dois scrolls concorrentes. Só a lista de ligações deve deslocar-se quando a altura disponível não for suficiente; marca, controlo e perfil ficam estáveis.
- Ao adicionar uma entrada, reutilizar a anatomia, densidade, ícone e estado ativo das entradas existentes. Um módulo novo não ganha um tratamento promocional próprio no menu.

## Anatomia obrigatória dos cartões

Um cartão normal da plataforma tem:

- fundo `var(--surface)` ou `var(--color-surface)`;
- borda de 1 px com `var(--line)` ou `var(--color-border)`;
- raio `var(--radius)`; em controlos internos, `var(--radius-control)`;
- sombra `var(--shadow)` ou a sombra muito discreta já usada em `.stat-card`;
- espaçamento interior de 16 a 20 px no desktop;
- ícone pequeno, entre 38 e 42 px, sobre `var(--gold-soft)`, `var(--blue-soft)` ou `var(--green-soft)` quando o significado o justificar;
- título curto, descrição discreta em `var(--muted)` e uma ação inequívoca;
- estados selecionado, sucesso, aviso e erro indicados por borda, fundo suave e ícone — nunca por uma mudança completa de tema.

Para coleções de dados extensas, preferir uma tabela ou linhas dentro de um único painel. Não transformar cada registo numa ilha visual pesada.

## Cabeçalhos e hierarquia

- O fundo da área de trabalho mantém-se claro.
- O cabeçalho da página é simples e sem contentor decorativo: eyebrow dourada, `h1`, descrição e ação primária à direita.
- A ação principal usa o componente de botão existente.
- As secções usam painéis brancos com cabeçalho de 72–78 px e separador inferior.
- Os números de resumo usam o padrão `stat-card`/`admin-stats`, não banners personalizados.
- A escala tipográfica e a densidade devem coincidir com `/admin/` e Turmas, incluindo textos auxiliares compactos.

## Proibições visuais

Sem pedido explícito do utilizador, é proibido:

- criar heroes escuros, fundos navy ou cabeçalhos em gradiente;
- criar paletas novas por módulo;
- usar cartões gigantes, raios excessivos ou sombras flutuantes fortes;
- animar cartões com saltos ou deslocações verticais no hover;
- usar cores diferentes em cada cartão apenas para decoração;
- duplicar tokens ou componentes que já existam em `app/globals.css`;
- aplicar estilos promocionais ou de landing page a ferramentas administrativas;
- acrescentar CSS corretivo no fim do ficheiro para anular experiências anteriores; remover a regra errada e manter uma única definição.

Gradientes funcionais, como uma barra de progresso ou um gráfico circular, podem ser usados com parcimónia. Não são permitidos como decoração estrutural.

## Formulários e ações

- Labels sempre visíveis; placeholders não substituem labels.
- Altura, borda, raio e foco devem reutilizar os controlos existentes.
- A ação primária aparece uma vez por contexto; ações secundárias são visivelmente menos fortes.
- Desativado, a carregar, sucesso e erro devem ser distinguíveis sem depender apenas da cor.
- Operações destrutivas exigem confirmação e linguagem explícita.
- Em mobile, ações deixam de competir horizontalmente e podem ocupar a largura disponível.

## Responsividade e acessibilidade

- Validar pelo menos a 1440 px, 1024 px, 768 px e 390 px.
- Não permitir overflow horizontal da página.
- Preservar foco visível, navegação por teclado, labels acessíveis e contraste.
- Respeitar `prefers-reduced-motion`.
- Conteúdo ocultado visualmente também deve ter comportamento semântico coerente.

## Processo obrigatório de QA visual

1. Abrir `/admin/` e a página de Turmas no Chrome como referência.
2. Abrir a página alterada lado a lado e comparar fundo, cabeçalho, painéis, cartões, controlos, tipografia e densidade.
3. Fazer capturas completas em desktop e mobile.
4. Exercitar estados reais: vazio, carregamento, erro, dados longos, selecionado e desativado.
5. Corrigir a implementação, não mascarar regras antigas com uma segunda camada de overrides.
6. Executar TypeScript, lint, testes e build.

Uma alteração visual só está concluída quando parece pertencer ao mesmo produto e foi verificada no Chrome, não apenas quando compila.
