# Realizado — alimentação mês a mês pelos sistemas-fonte

O Simulador deixou de ser só digitação. Cada operação do grupo é uma empresa no sistema e recebe, mês a mês, os dados reais dos outros sistemas. O que a fonte não tem fica **vazio e sinalizado**; pode ser preenchido à mão e o valor digitado vence a sincronização.

Implementa a entidade `realizado_mensal` prevista no roadmap v2 do SPEC (formato *wide*: uma coluna por driver).

## Empresas alimentadas

Cada operação é uma `sim_empresa` própria, mesmo quando divide o CNPJ (Playground e Circuito do Parque Shopping, CNPJ 66.318.630/0001-17). A restrição de CNPJ único de `sim_empresa` foi removida por isso.

| Empresa | Id | Fontes |
|---|---|---|
| FaçaAmigos Playground (Parque Shopping) | `a0000000-0000-4000-8000-000000000001` | PDV `11111111-1111-1111-1111-111111111111` + RH `faca-amigos-parque-shopping` |
| FaçaAmigos Circuito (Parque Shopping) | `a0000000-0000-4000-8000-000000000002` | PDV `e43ba7a8-bd5f-47ad-b81d-dae7ea19d504` |
| FaçaAmigos Playground (Bosque Grão-Pará) | `a0000000-0000-4000-8000-000000000003` | PDV `5fc99a57-81ee-4232-a105-1fcb4634cef4` + RH `faca-amigos-grao-para` |
| Clínica FaçaAmigos | `a0000000-0000-4000-8000-000000000004` | Clínica `c0000000-0000-0000-0000-000000000001` + RH `clinica-a` |

Cacau Show (HubOperacoes) ficou fora. As fontes de cada empresa são editáveis na própria tela Realizado.

## Como funciona

- **Tabelas** (projeto `ivjvpdzsfjdpyabbzzuj`): `sim_fonte_dados`, `sim_realizado_mensal`, `sim_sincronizacao`.
- **Escuta automática:** o job `sim-sincronizar-mensal` roda todo dia às 03:15 de Belém e a função `sim_cron_sincronizar()` só dispara no **4º último dia do mês** (dia 27 em mês de 30 dias, 28 em mês de 31, 25 ou 26 em fevereiro). Cada execução sincroniza o mês anterior e o corrente.
- **Sincronização manual:** botão "Sincronizar agora" na tela Realizado, para qualquer mês.
- **PDV:** função SQL `sim_extrair_pdv(unit_id, competencia)`, separando as unidades por `unit_id`.
- **Clínica e RH:** vivem em outro projeto Supabase. A Edge Function `sim-sincronizar` lê o projeto B com a service-role dele e grava tudo pela RPC `sim_gravar_realizado`.
- **Mesclagem:** célula `manual` não é sobrescrita; mês `fechado` não é tocado; nos dois casos só `sobrescrever` força.
- **Status por campo:** `ok` · `sem_fonte` (o sistema não tem o dado) · `sem_dados` (a fonte tem, mas o mês veio vazio) · `parcial` (estimativa, foto na sincronização ou mês em andamento) · `manual`.

## O que cada fonte entrega

| Campo | PDV | Clínica | RH |
|---|---|---|---|
| Receita bruta, serviços, produtos, descontos, cancelamentos, pedidos | ok | serviços (convênio + particular + mensalidades pagas) | |
| Dinheiro, Pix, débito, crédito, voucher | ok (por `fa_kiosk_payments.method`) | Pix parcial; demais sem fonte | |
| A prazo | 0 (PDV não vende a prazo) | parcial (convênio + boleto) | |
| Glosas, repasses a terapeutas | | ok | |
| Inadimplência, contas a receber, contas a pagar | | parcial, só no mês corrente | |
| Aluguel, manutenção, marketing, outros fixos | | ok (contas a pagar pagas) | |
| Compras | parcial (entradas de estoque × custo) | parcial (contas de fornecedores) | |
| Impostos sobre vendas | | parcial (todos os tributos pagos) | |
| Folha | parcial (fechamento de folha do PDV) | parcial (conta a pagar "folha") | ok (documento do contador) ou parcial (salários-base) |
| Encargos, temporários | | | ok / sem_dados |
| Estoque, créditos pré-pagos | parcial, só no mês corrente | | |
| Quebra de caixa | ok | | |
| **Pró-labore, distribuição de lucros, IR/CSLL, frete, comissões, caixa e bancos** | sem fonte | sem fonte | sem fonte |

Nenhum sistema tem saldo bancário, pró-labore, distribuição de lucros ou IR/CSLL. Esses campos ficam `sem_fonte` e precisam ser digitados no painel.

## Alimentar uma simulação

No editor, o botão **Alimentar com realizado** lê os 12 meses até a data-base e preenche o histórico de 12 meses e a abertura:

- rb12, compras12, folha12 (folha + encargos), temporarios12, proLabore12, marketing12, distribuicao12, frete12, impVendas12, irCsll12, fixos12 (aluguel + manutenção + outros), pctComissao;
- mix de pagamento (pctVista = pix + dinheiro + débito; pctCartao = crédito + voucher; pctPrazo), descVista e pctInadimplencia estimados;
- sazonalidade pela receita de cada mês do calendário (média 1);
- abertura: caixa0, cr0 e estoque0 do mês da data-base.

Um campo só é preenchido quando **todos** os meses da janela têm dado; senão vira lacuna sinalizada com o motivo. Sem "sobrescrever valores já digitados", só entram campos vazios. Campos preenchidos aparecem com ↓ (importado) e a lista de lacunas fica no topo das premissas. Prazos médios (recebimento, pagamento, cartão) e capital social não vêm do realizado. A lógica é pura e está em `packages/engine/src/realizado.ts`.

## Operação

Configurado em 2026-09-30:

- migrations `20260901000000_sim_baseline` (retrato do schema que já existia), `20261005000000_sim_realizado` e `20261005000100_sim_seed_empresas`;
- Edge Function `sim-sincronizar` publicada com `verify_jwt=false` (autentica por `x-ops-key` ou por JWT de usuário autorizado);
- job pg_cron `sim-sincronizar-mensal` ativo.

**Falta fazer (manual, exige chaves):**

1. Gerar uma chave: `openssl rand -hex 32`.
2. No projeto A: `select vault.create_secret('<chave>', 'sim_ops_key', 'x-ops-key do sim-sincronizar');`
3. Nos secrets da função: `supabase secrets set SIM_OPS_KEY=<chave> CLINICA_SUPABASE_URL=https://vththexblpxwocbowhsv.supabase.co CLINICA_SUPABASE_SERVICE_ROLE_KEY=<service-role do projeto B> --project-ref ivjvpdzsfjdpyabbzzuj`
4. Testar: `select public.sim_cron_sincronizar(true);` e conferir `sim_sincronizacao`.
5. Confirmar no cadastro da Clínica o CNPJ e o regime tributário (o seed usou `simples` e CNPJ vazio nas quatro).

Sem os secrets do projeto B, PDV funciona; Clínica e RH registram erro legível no histórico da sincronização.

## Dados hoje (2026-09-30)

- Clínica e RH: tabelas financeiras ainda vazias; tudo aparece `sem_dados` até os sistemas lançarem.
- Grão-Pará: um pedido de R$ 5 em agosto.
- PDV Playground em setembro: receita R$ 35.265,58 (total cobrado; os itens somavam R$ 62.411,68 porque pedidos de sessão valorizam o tempo a preço de lista/crédito, então a receita usa `fa_kiosk_orders.total_cents`, igual aos pagamentos). Circuito: R$ 15.052,10.
- Os pagamentos do PDV ficam abaixo da receita quando há sessões pré-pagas; a alimentação avisa quando a cobertura é menor que 80%.
- Nenhuma folha lançada no PDV nem documentos do contador no RH: `folha12` vira lacuna até isso existir.
