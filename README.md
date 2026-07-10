# Gestor Universitário

Plataforma digital da Comissão de Curso de Medicina 2025–2031.

> **Estado atual:** planeamento. Este repositório ainda não contém código da aplicação.

## Primeira aplicação: turmas do 2.º ano

### Decisão aprovada pelos estudantes

As turmas do 1.º ano serão mantidas como base para o 2.º ano, permitindo apenas trocas pontuais que respeitem as vagas e não provoquem desequilíbrios na distribuição final.

### Objetivo do MVP

Permitir que os estudantes peçam trocas de turma de forma transparente e que a Comissão valide uma proposta final equilibrada, preservando ao máximo as turmas existentes.

### Regras funcionais propostas

1. A colocação inicial de cada estudante é a sua turma do 1.º ano.
2. O estudante pode pedir uma turma de destino e, quando existir, indicar uma troca direta com outro estudante.
3. Uma troca que envolva estudantes identificados só entra no processamento após confirmação de todos.
4. O sistema privilegia, por esta ordem:
   - trocas diretas entre dois estudantes;
   - ciclos de troca entre várias turmas;
   - mudanças para vagas livres, sem ultrapassar limites mínimos ou máximos.
5. Nenhum pedido garante uma mudança; a Comissão revê e aprova o resultado antes da publicação.
6. Todas as decisões ficam registadas para auditoria e eventual fase de reclamação.

### Fluxo principal

1. A Comissão importa a lista inicial de estudantes, turmas e capacidades.
2. Cada estudante autentica-se e confirma os seus dados.
3. Durante um prazo definido, submete, altera ou cancela o pedido.
4. O sistema valida consentimentos e calcula uma proposta equilibrada.
5. A Comissão simula, revê exceções e aprova a distribuição.
6. O sistema publica apenas o resultado individual e permite exportar a lista final.

### Funcionalidades do MVP

- autenticação com endereço institucional;
- importação e exportação em CSV;
- gestão de turmas, capacidades e prazos;
- submissão e confirmação de pedidos de troca;
- validação automática de vagas e equilíbrio;
- cálculo de trocas diretas, ciclos e vagas livres;
- painel administrativo com simulação antes da aprovação;
- histórico de alterações e exportação do resultado final;
- comunicação do estado do pedido ao estudante.

### Perfis

- **Estudante:** consulta a colocação própria e gere o seu pedido.
- **Comissão de Curso:** configura regras, importa dados, acompanha pedidos e aprova resultados.

### Tecnologia prevista

- **Aplicação:** Next.js e TypeScript;
- **Base de dados e autenticação:** PostgreSQL com Supabase;
- **Alojamento:** Vercel;
- **Qualidade:** testes automáticos e GitHub Actions.

Esta opção permite desenvolver rapidamente, manter tipagem de ponta a ponta e começar com serviços gratuitos ou de baixo custo. A arquitetura será confirmada antes da programação.

### Privacidade e segurança

- o repositório público nunca conterá nomes, números mecanográficos, emails ou ficheiros reais de estudantes;
- recolha mínima de dados e acesso por perfil;
- segredos apenas em variáveis de ambiente;
- registo das operações administrativas;
- política de conservação e eliminação de dados a definir antes do lançamento;
- conformidade com o RGPD e validação institucional antes de usar dados reais.

### Critérios de sucesso

- nenhuma colocação muda sem pedido ou decisão administrativa registada;
- nenhuma turma termina fora dos limites aprovados;
- todas as trocas que exigem consentimento ficam confirmadas;
- o resultado pode ser reproduzido e auditado;
- cada estudante vê apenas os dados necessários ao seu pedido.

### Decisões necessárias antes da implementação

- número de turmas e capacidade mínima/máxima de cada uma;
- formato e campos da lista inicial;
- regras de prioridade e desempate;
- tratamento de casos excecionais e reclamações;
- método de autenticação institucional;
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

