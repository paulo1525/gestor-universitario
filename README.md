# Gestor Universitário

Plataforma digital da Comissão de Curso de Medicina 2025–2031.

> **Estado atual:** planeamento. Este repositório ainda não contém código da aplicação.

## Primeira aplicação: turmas do 2.º ano

### Decisão aprovada pelos estudantes

As turmas do 1.º ano serão mantidas como base para o 2.º ano, permitindo apenas trocas pontuais que respeitem as vagas e não provoquem desequilíbrios na distribuição final.

### Objetivo do MVP

Permitir que os representantes de turma registem a constituição atual das turmas e as preferências dos estudantes, para que a Comissão valide uma proposta final equilibrada e preserve ao máximo as turmas existentes.

### Autenticação e autorização

- A opção preferencial é a **Autenticação Federada da U.Porto (AAI)**, com as credenciais institucionais e o segundo fator de autenticação geridos pela Universidade.
- A integração da aplicação na AAI depende de autorização e configuração técnica pela UPdigital; não deve ser considerada garantida antes dessa aprovação.
- Como alternativa temporária, poderá ser usado acesso sem palavra-passe por ligação ou código enviado para o email institucional. Esta alternativa confirma o controlo do email, mas não equivale ao início de sessão federado da U.Porto.
- Ter uma conta U.Porto válida não concede acesso automaticamente: o utilizador tem também de constar da lista de pessoas autorizadas da aplicação.
- A autorização será baseada no número mecanográfico e no email institucional previamente registados, com um perfil e âmbito definidos.
- O domínio do email, por si só, nunca será usado como única medida de segurança.

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

- autenticação U.Porto AAI, condicionada a aprovação institucional, ou alternativa temporária por email institucional;
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
- **Autenticação:** U.Porto AAI através de SAML/Shibboleth, se autorizada; alternativa a definir por email institucional;
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
- aprovação da UPdigital para integração com a AAI e atributos de identidade que serão disponibilizados;
- alternativa de autenticação caso a integração institucional não seja autorizada a tempo;
- datas das fases de pedido, revisão e publicação;
- responsável pelo tratamento dos dados e prazo de conservação.

## Roteiro

1. Validar regras e modelo de dados com a Comissão.
2. Criar protótipo dos ecrãs e testar o fluxo sem dados reais.
3. Implementar autenticação, importação e pedidos.
4. Implementar e testar o motor de trocas.
5. Criar painel administrativo, auditoria e exportação.
6. Fazer teste-piloto com dados fictícios.
7. Realizar revisão de segurança/RGPD e lançar a aplicação.

## Referências institucionais

- [Autenticação Federada — UPdigital](https://www.up.pt/portal/pt/updigital/servicos/contas-passwords/autenticacao-federada/)
- [Microsoft Office 365 — UPdigital](https://www.up.pt/portal/pt/updigital/servicos/contas-passwords/office-uporto/)

