# Gestor Universitário

Plataforma digital da Comissão de Curso de Medicina 2025–2031.

<p align="center">
  <img src="docs/assets/logo-comissao-curso-fmup-2025-2031.jpeg" alt="Logótipo da Comissão de Curso FMUP 2025–2031" width="280">
</p>

> **Estado atual:** planeamento. Este repositório ainda não contém código da aplicação.

## Visão da plataforma

O Gestor Universitário será o ponto central de comunicação, organização e partilha de recursos da Comissão de Curso. A gestão das turmas do 2.º ano será a primeira aplicação, seguindo-se os módulos abaixo.

### Módulos previstos

- **Avisos importantes:** faixa destacada no topo da aplicação, com nível de prioridade, período de exibição e ligação para informação adicional.
- **Feedback e sugestões:** formulário que permite enviar opiniões à Comissão de forma anónima, sem guardar a identidade do autor, sujeito a medidas contra abuso.
- **Envio de materiais para a CC:** estudantes autorizados podem submeter materiais, identificando cadeira, ano, tipo de documento e origem; a Comissão revê antes de publicar.
- **Biblioteca de estudo:** área organizada por cadeira para sebentas, compêndios, exames anteriores e outros recursos académicos aprovados, com pesquisa e controlo de versões.
- **Cadeiras e horários:** página central com cadeiras do ano, horários, documentos relevantes e ligações úteis, atualizada pela Comissão.
- **Contactos e identidade:** apresentação do logótipo e do email oficial da Comissão de Curso.

Materiais submetidos nunca são publicados automaticamente. A Comissão deve confirmar a origem, remover dados pessoais e rejeitar conteúdos obtidos ilegitimamente, avaliações futuras ou ainda ativas e materiais cuja partilha viole direitos aplicáveis.

## Primeira aplicação: turmas do 2.º ano

### Decisão aprovada pelos estudantes

As turmas do 1.º ano serão mantidas como base para o 2.º ano, permitindo apenas trocas pontuais que respeitem as vagas e não provoquem desequilíbrios na distribuição final.

### Objetivo do MVP

Permitir que os representantes de turma registem a constituição atual das turmas e as preferências dos estudantes, para que a Comissão valide uma proposta final equilibrada e preserve ao máximo as turmas existentes.

### Autenticação e autorização

- A aplicação terá **autenticação própria por código temporário enviado para o email institucional**.
- O utilizador introduz o email, recebe um código de utilização única e usa-o para iniciar uma sessão segura.
- Ter um email institucional válido não concede acesso automaticamente: o endereço tem também de constar da lista de pessoas autorizadas da aplicação.
- Cada utilizador autorizado terá um perfil e um âmbito definidos, como Comissão ou representante de uma turma específica.
- Os códigos terão validade curta, limite de tentativas e pedidos, utilização única e serão guardados apenas de forma protegida.
- A resposta ao pedido de código não revelará se determinado endereço existe na lista, reduzindo a possibilidade de enumeração de utilizadores.

### Regras funcionais propostas

1. A colocação inicial de cada estudante é a sua turma do 1.º ano.
2. Cada representante de turma só pode preencher e consultar o formulário da turma que lhe foi atribuída.
3. Cada aluno inserido tem obrigatoriamente **nome completo** e **número mecanográfico**.
4. O número mecanográfico é único em todo o ano e o sistema impede duplicados entre turmas.
5. Para cada aluno, o representante seleciona uma das opções:
   - **Prefere ficar:** o aluno fica bloqueado na turma atual e não participa nas permutações;
   - **Prefere mudar:** é obrigatório indicar a turma de destino preferida e o aluno fica elegível para permutações.
6. Um bloqueio só pode ser removido pela Comissão, com justificação registada, enquanto o processo não estiver encerrado.
7. Se não for encontrada uma mudança válida para um aluno que prefere mudar, este mantém-se na turma atual.
8. O sistema privilegia, por esta ordem:
   - trocas diretas entre dois estudantes;
   - ciclos de troca entre várias turmas;
   - mudanças para vagas livres, sem ultrapassar limites mínimos ou máximos.
9. Nenhuma preferência garante uma mudança; a Comissão revê e aprova o resultado antes da publicação.
10. Todas as submissões, alterações e decisões ficam registadas para auditoria e eventual fase de reclamação.

### Fluxo principal

1. A Comissão cria as turmas, define as capacidades e associa cada representante à sua turma.
2. O representante autentica-se e abre o formulário da turma atribuída.
3. Insere cada aluno com nome completo, número mecanográfico e preferência: ficar ou mudar.
4. Quando escolhe mudar, indica obrigatoriamente a turma de destino preferida.
5. O representante revê a lista e submete a versão completa da turma dentro do prazo.
6. A Comissão valida duplicados, omissões e eventuais conflitos entre submissões.
7. O sistema fixa os alunos que preferem ficar e calcula permutações apenas entre os restantes.
8. A Comissão simula, revê exceções e aprova a distribuição.
9. O sistema permite exportar a lista final e mantém o histórico das decisões.

### Funcionalidades do MVP

- autenticação por código temporário enviado para emails institucionais previamente autorizados;
- lista explícita de utilizadores autorizados e controlo de acesso por perfil e turma;
- importação e exportação em CSV;
- gestão de turmas, capacidades e prazos;
- formulário do representante com nome completo, número mecanográfico e preferência de cada aluno;
- bloqueio automático dos alunos que preferem ficar;
- validação de campos obrigatórios, números mecanográficos duplicados, omissões e conflitos;
- submissões versionadas, com possibilidade de correção até ao prazo definido;
- validação automática de vagas e equilíbrio;
- cálculo de trocas diretas, ciclos e vagas livres;
- painel administrativo com simulação antes da aprovação;
- histórico de alterações e exportação do resultado final;
- comunicação do estado do pedido ao estudante.

### Perfis

- **Representante de turma:** preenche e submete exclusivamente a lista da sua turma.
- **Comissão de Curso:** autoriza utilizadores, configura regras, valida submissões, acompanha preferências e aprova resultados.
- **Estudante:** poderá consultar apenas o seu resultado numa fase posterior, se esta funcionalidade for aprovada.

### Tecnologia prevista

- **Aplicação:** Next.js e TypeScript;
- **Base de dados:** PostgreSQL com Supabase;
- **Autenticação:** código temporário enviado por email, com sessões seguras e lista de endereços autorizados;
- **Alojamento:** Vercel;
- **Qualidade:** testes automáticos e GitHub Actions.

Esta opção permite desenvolver rapidamente, manter tipagem de ponta a ponta e começar com serviços gratuitos ou de baixo custo. A arquitetura será confirmada antes da programação.

### Privacidade e segurança

- o repositório público nunca conterá nomes, números mecanográficos, emails ou ficheiros reais de estudantes;
- recolha mínima de dados e acesso por perfil;
- cada representante acede apenas aos dados da turma que representa;
- nomes completos e números mecanográficos são guardados apenas na base de dados privada da aplicação;
- a preferência de mudança é tratada como dado de acesso restrito à Comissão e ao representante responsável;
- segredos apenas em variáveis de ambiente;
- registo das operações administrativas;
- política de conservação e eliminação de dados a definir antes do lançamento;
- conformidade com o RGPD e validação institucional antes de usar dados reais.

### Critérios de sucesso

- nenhuma colocação muda sem pedido ou decisão administrativa registada;
- todos os alunos submetidos têm nome completo e número mecanográfico válido e único;
- todos os alunos marcados como «prefere ficar» permanecem bloqueados na turma atual;
- só os alunos marcados como «prefere mudar» participam no cálculo de permutações;
- nenhuma turma termina fora dos limites aprovados;
- um aluno sem permutação válida mantém a turma atual;
- o resultado pode ser reproduzido e auditado;
- cada utilizador vê apenas os dados correspondentes ao seu perfil e âmbito autorizado.

### Decisões necessárias antes da implementação

- número de turmas e capacidade mínima/máxima de cada uma;
- lista dos representantes e respetiva turma;
- possibilidade de cada aluno indicar apenas uma ou várias turmas de destino;
- regras de prioridade e desempate;
- tratamento de casos excecionais e reclamações;
- domínios institucionais aceites e lista inicial de endereços autorizados;
- serviço de envio de emails transacionais e respetivos limites;
- datas das fases de pedido, revisão e publicação;
- responsável pelo tratamento dos dados e prazo de conservação.

## Roteiro

1. Validar regras e modelo de dados da gestão de turmas com a Comissão.
2. Criar protótipo dos ecrãs e testar o fluxo sem dados reais.
3. Implementar autenticação por email, importação e formulários das turmas.
4. Implementar e testar o motor de permutações.
5. Criar painel administrativo, auditoria e exportação.
6. Fazer teste-piloto com dados fictícios e realizar revisão de segurança/RGPD.
7. Lançar a gestão de turmas.
8. Acrescentar avisos, contactos e feedback anónimo.
9. Acrescentar cadeiras, horários, submissão de materiais e biblioteca de estudo.

