# Contexto de Desenvolvimento e Handoff — Sistema de Gestão Financeira Real (FaçaAmigos)

> **Data de Atualização:** 30 de Setembro de 2026  
> **Público-alvo:** Desenvolvedores e equipe técnica  
> **Objetivo:** Orientar a evolução do projeto, migrando o foco de "Simulador" para um **Painel de Gestão Financeira Real e Coleta de Dados Consolidada por CNPJ**.

---

## 1. Visão Geral e Mudança de Escopo

O projeto evoluiu de um simulador de cenários para um **Sistema de Gestão Financeira de Fato**, focado na consolidação diária/mensal do realizado das operações do **Grupo FaçaAmigos**. 

O sistema é de **uso operacional interno** (operado principalmente por **Bruno e Isabel**). Por isso, a prioridade máxima é a **eficiência de uso, velocidade de acesso aos dados e clareza visual**, sem redundância de passos ou telas de confirmação excessivas.

---

## 2. Requisitos e Diretrizes Solicitadas (Atualização)

### 2.1. Tela Principal (Dashboard por CNPJ)
- **Barra de Progresso (0% a 100%):** A tela inicial deve exibir os dados das empresas com um indicador/barra de progresso mostrando o percentual de dados preenchidos/sincronizados para a competência atual.
- **Foco por CNPJ Real:** Exibir apenas as empresas/CNPJs oficiais do Grupo.
- **Transição de Conceito:** Remover referências a "simulação" da interface principal, tratando as informações como **Coleta e Cobertura de Dados Financeiros Reais**.

### 2.2. Limpeza de Dados e Mapeamento Oficial
- **Remover Empresas/Clínicas de Teste:** Excluir do banco/interface qualquer cadastro manual ou fictício criado durante testes.
- **Manter apenas as Operações Reais do Grupo:**
  1. **FaçaAmigos Playground (Parque Shopping)** — CNPJ: `66.318.630/0001-17` (Fontes: PDV + RH)
  2. **FaçaAmigos Circuito (Parque Shopping)** — CNPJ: `66.318.630/0001-17` (Fonte: PDV)
  3. **FaçaAmigos Playground (Bosque Grão-Pará)** — CNPJ: `66.318.630/0001-17` (Fontes: PDV + RH)
  4. **Clínica FaçaAmigos (Centro de Terapia Comportamental)** — (Fontes: Sistema da Clínica + RH)

### 2.3. Otimização do Fluxo de Navegação (UX Direta)
- **Redução de Passos:** Eliminar telas intermediárias de transição. O acesso ao preenchimento/visualização do realizado de cada CNPJ deve ser direto (1 clique).
- **Interface Focada na Operação:** Navegação enxuta, otimizada para consulta rápida e input de lacunas manuais sem sobrecarga de menus.

---

## 3. Arquitetura Técnica Atual

### 3.1. Stack Tecnológico
- **Frontend / Framework:** Next.js 15 (App Router), React 19, Tailwind CSS.
- **Monorepo Structure:**
  - `apps/web`: Aplicação Next.js principal (rotas, telas e componentes UI).
  - `packages/engine`: Motor financeiro e lógicas puras de consolidação e DRE (`@sf/engine`).
- **Backend & Banco de Dados:** Supabase (PostgreSQL 15+, Row Level Security, Edge Functions em Deno).

### 3.2. Estrutura do Banco de Dados (`public`)
- `sim_empresa`: Cadastro central das empresas/CNPJs do grupo.
- `sim_fonte_dados`: Mapeamento das origens de dados (`pdv`, `clinica`, `rh`) e suas chaves (`unit_id`, `clinic_id`).
- `sim_realizado_mensal`: Tabela em formato *wide* que armazena os valores reais por competência (`YYYY-MM-01`) e o mapa de proveniente/status por campo (`ok`, `sem_fonte`, `sem_dados`, `parcial`, `manual`).
- `sim_sincronizacao`: Histórico das rotinas automáticas de sincronização (job cron) e disparos manuais.

---

## 4. Próximos Passos Recomendados para o Desenvolvedor

1. **Ajustes de UI no Dashboard (`apps/web/app/empresas/page.tsx` e `ListaEmpresas.tsx`):**
   - Reformular a listagem de empresas para exibir o **card por CNPJ com a barra de progresso de preenchimento (0% a 100%)**.
   - Atualizar os textos e títulos substituindo termos de "simulação" por "gestão financeira / realizado".

2. **Otimização de Rotas e Atalhos de Navegação:**
   - Redirecionar/simplificar o fluxo para que o clique no card da empresa leve diretamente à tela de **Realizado/Coleta de Dados** (`/empresas/[id]/realizado`).

3. **Limpeza de Seeds e Cadastros Inexistentes:**
   - Executar script de limpeza para remover dados de simulação/empresas manuais não pertencentes à lista oficial.

4. **Verificação de Integração de Fontes:**
   - Garantir a configuração dos secrets no Supabase para sincronização com o projeto da Clínica (`CLINICA_SUPABASE_URL` e `CLINICA_SUPABASE_SERVICE_ROLE_KEY`).

---

## 5. Documentações de Referência
- [`docs/REALIZADO.md`](file:///c:/Users/bruno/Documents/Projetos/Simulador%20Financeiro/docs/REALIZADO.md): Detalhamento técnico da sincronização, fontes e mapeamento de campos.
- [`PRD_Simulador_Financeiro.md`](file:///c:/Users/bruno/Documents/Projetos/Simulador%20Financeiro/PRD_Simulador_Financeiro.md): Requisitos funcionais históricos e regras de negócio.
