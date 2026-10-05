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
- **Escuta automática:** o job `sim-sincronizar-mensal` roda **todo dia às 03:15 de Belém**. Cada execução sincroniza o mês corrente (prévia sempre atualizada) e o mês anterior enquanto ele não estiver fechado. **A partir do dia 2**, o mês anterior é **fechado automaticamente** quando a sincronização dele deu certo e há receita e folha; sem folha ou sem receita ele continua aberto e o motivo fica no histórico (`nao_fechados`). Mês fechado não é tocado (reabra no painel para corrigir). O dia 2 (e não o penúltimo dia) é de propósito: o dia de negócio do PDV vira às 04h e o fim do mês chega depois da última sincronização.
- **Falha visível:** se a chave `sim_ops_key` faltar no Vault ou o disparo falhar, `sim_cron_sincronizar()` grava uma linha `erro` em `sim_sincronizacao` (antes devolvia `skip` e o pg_cron marcava "succeeded"), e a tela Realizado mostra um alerta quando não há sincronização bem-sucedida nas últimas 36 h.
- **Sincronização manual:** botão "Sincronizar agora" na tela Realizado, para qualquer mês.
- **PDV:** função SQL `sim_extrair_pdv(unit_id, competencia)`, separando as unidades por `unit_id`.
- **Clínica e RH:** vivem em outro projeto Supabase (B). A Edge Function chama as RPCs `sim_extrair_clinica` e `sim_extrair_rh` de lá (`supabase/projeto-b/migrations/`), que devolvem **só totais do mês**, protegidas pela chave `sim_hub_key` do Vault dos dois projetos. Não há service-role do projeto B no Simulador, e nenhum dado de paciente ou de funcionário sai de lá. Tudo é gravado pela RPC `sim_gravar_realizado`.
- **Mesclagem:** célula `manual` não é sobrescrita; mês `fechado` não é tocado; nos dois casos só `sobrescrever` força.
- **Status por campo:** `ok` · `sem_fonte` (o sistema não tem o dado) · `sem_dados` (a fonte tem, mas o mês veio vazio) · `parcial` (foto na sincronização, proxy ou mês em andamento) · `manual` · `estimado` (calculado por regra/modelo de custos; nunca sobrescreve `ok`, `parcial` nem `manual`).

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
| Folha | parcial (fechamento de folha do PDV) | parcial (conta a pagar "folha") | ok (documento do contador) ou estimado (salário-base dos CLT ativos) |
| Encargos | | | ok (documento do contador) ou estimado (folha × % do modelo) |
| Temporários / freelas | | | freelances pagos no mês (ok) + bolsas dos estagiários ativos (estimado) |
| Estoque, créditos pré-pagos | parcial, só no mês corrente | | |
| Quebra de caixa | ok | | |
| Taxas de cartão (MDR) | estimado (modelo de custos × débito/crédito) | sem fonte | |
| Impostos sobre vendas, aluguel, manutenção, marketing, outros fixos | estimado (modelo de custos) | ok/parcial (contas a pagar) | |
| **Pró-labore, distribuição de lucros, IR/CSLL, frete, comissões, caixa e bancos** | sem fonte | sem fonte | sem fonte |

Nenhum sistema tem saldo bancário, pró-labore, distribuição de lucros ou IR/CSLL. Esses campos ficam `sem_fonte` e precisam ser digitados no painel.

## Estimativas (modelo de custos)

O que nenhum sistema registra é calculado depois das fontes, a partir de `sim_modelo_custos` (painel "Modelo de custos" na tela Realizado, uma linha por empresa). Só entra em campo `sem_fonte`/`sem_dados`/`estimado`; dado real e célula digitada sempre vencem, e cada célula guarda a fórmula usada na observação.

| Campo | Regra |
|---|---|
| Taxas de cartão | débito × taxa + crédito × taxa + Pix × taxa + voucher × taxa (padrão 1,0% / 3,0% / 0% / 0%). Só quando o mês tem débito/crédito conhecidos |
| Impostos sobre vendas | receita bruta × alíquota efetiva (padrão 6%, Simples Anexo III 1ª faixa; Playground e Circuito dividem o CNPJ, então a alíquota real vem da receita **somada** dos 12 meses) |
| Encargos | folha × % (padrão 28%: FGTS + provisões de 13º e férias; no Simples a parte patronal está no DAS) |
| Aluguel | maior entre o mínimo e o % do faturamento + condomínio + fundo de promoção |
| Manutenção, marketing, outros fixos | valor fixo mensal |

Valores do modelo em branco significam "não estimar". Salários-base e bolsas são a foto de hoje: só entram no mês corrente e no anterior, nunca em meses antigos.

No editor, "Alimentar com realizado" deriva a taxa média do cartão como Σ taxas ÷ Σ (crédito + voucher): o motor aplica a taxa só à base "cartão" (crédito + voucher; débito entra em "à vista"), então o MDR do débito fica diluído nessa taxa e o custo total bate. A UI avisa que é estimativa.

## Alimentar uma simulação

No editor, o botão **Alimentar com realizado** lê os 12 meses até a data-base e preenche o histórico de 12 meses e a abertura:

- rb12, compras12, folha12 (folha + encargos), temporarios12, proLabore12, marketing12, distribuicao12, frete12, impVendas12, irCsll12, fixos12 (aluguel + manutenção + outros), pctComissao;
- mix de pagamento (pctVista = pix + dinheiro + débito; pctCartao = crédito + voucher; pctPrazo), descVista e pctInadimplencia estimados;
- sazonalidade pela receita de cada mês do calendário (média 1);
- abertura: caixa0, cr0 e estoque0 do mês da data-base.

Um campo só é preenchido quando **todos** os meses da janela têm dado; senão vira lacuna sinalizada com o motivo. Sem "sobrescrever valores já digitados", só entram campos vazios. Campos preenchidos aparecem com ↓ (importado) e a lista de lacunas fica no topo das premissas. Prazos médios (recebimento, pagamento, cartão) e capital social não vêm do realizado. A lógica é pura e está em `packages/engine/src/realizado.ts`.

## Operação

Em produção desde 2026-10-05 (projeto A `ivjvpdzsfjdpyabbzzuj`, projeto B `vththexblpxwocbowhsv`):

- migrations `20261005*` e `20261006000000_sim_escuta_automatica` (projeto A) e `supabase/projeto-b/migrations/20261006000100_sim_extracao` (projeto B);
- Edge Function `sim-sincronizar` v7 (`verify_jwt=false`; autentica por `x-ops-key` validada contra o Vault ou por JWT de usuário autorizado);
- segredos no Vault de A: `sim_ops_key`, `sim_hub_key`, `sim_b_url`, `sim_b_anon`; no Vault de B: `sim_hub_key` (mesmo valor). Nenhum secret de função precisa ser copiado à mão;
- job pg_cron `sim-sincronizar-mensal` ativo (diário, 03:15 Belém).

Para girar a chave do hub: crie um novo `sim_hub_key` nos dois Vaults com o mesmo valor (`vault.update_secret`). Para testar: `select public.sim_cron_sincronizar();` e conferir `sim_sincronizacao`.

Pendências de dados (o sistema avisa na própria tela):

1. **Salário-base dos 4 CLT** do Parque Shopping no Gestão de Pessoas (hoje nulos): sem isso `folha` fica vazia e o mês não fecha sozinho. Quando o contador enviar o documento de folha (`unit_payroll_documents`, `meta.competencia`, `meta.tipo_folha`, `meta.valor`), ele passa a valer como `ok`.
2. **Modelo de custos** de cada empresa: aluguel, condomínio, fundo de promoção, manutenção, marketing e as alíquotas reais (hoje só taxas de cartão e 6%/28% de padrão).
3. Confirmar no cadastro da Clínica o CNPJ e o regime tributário (o seed usou `simples` e CNPJ vazio nas quatro).
4. Na Clínica, `paid_method` não é preenchido pelo sistema: dinheiro, débito e crédito ficam `sem_fonte` (só o Pix é inferido).

## Dados hoje (2026-09-30)

- Clínica e RH: tabelas financeiras ainda vazias; tudo aparece `sem_dados` até os sistemas lançarem.
- Grão-Pará: um pedido de R$ 5 em agosto.
- PDV Playground em setembro: receita R$ 35.265,58 (total cobrado; os itens somavam R$ 62.411,68 porque pedidos de sessão valorizam o tempo a preço de lista/crédito, então a receita usa `fa_kiosk_orders.total_cents`, igual aos pagamentos). Circuito: R$ 15.052,10.
- Os pagamentos do PDV ficam abaixo da receita quando há sessões pré-pagas; a alimentação avisa quando a cobertura é menor que 80%.
- Nenhuma folha lançada no PDV nem documentos do contador no RH: `folha12` vira lacuna até isso existir.
