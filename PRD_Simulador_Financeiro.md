# PRD \+ Especificação Técnica — Simulador Financeiro Projetado (BP · DRE · DFC · Indicadores · Cenários)

> **Destinatário:** IA/equipe desenvolvedora. **Autor do produto:** Bruno Pinto Freitas. **Versão da spec:** 1.0 — 2026-09-29. **Status:** aprovado para implementação do MVP. Seções marcadas com `⚠ DECISÃO PENDENTE` exigem confirmação do dono do produto antes de codar aquele trecho.

---

## 0\. Instruções para a IA desenvolvedora (LEIA PRIMEIRO)

1. **Esta spec é a fonte da verdade das fórmulas.** Não "melhore", não simplifique, não troque base de cálculo sem alterar esta spec primeiro e registrar no `CHANGELOG-SPEC.md`.  
2. **TDD obrigatório no motor (`packages/engine`).** Toda fórmula da Seção 6 tem teste unitário antes da implementação. Toda checagem da Seção 6.12 roda em todo teste de integração.  
3. **O motor é puro:** sem IO, sem `Date.now()`, sem aleatoriedade, sem acesso a banco. Mesma entrada → mesma saída, bit a bit.  
4. **Nunca calcule número na camada de UI nem na IA.** UI só formata. A IA de conclusão só cita números do JSON de resultado.  
5. **Divisão por zero / base inválida → `null`**, exibido como "—". Nunca `0`, nunca `NaN`, nunca `Infinity`.  
6. **Arredondamento só na exibição.** Internamente `number` (float64). Checagens com tolerância `EPS = 0.01` (R\$).  
7. **Classificação R/P:** cada fórmula tem tipo **R** (regra contábil consolidada — não mudar) ou **P** (escolha do produto — pode mudar via config, com teste).  
8. **Não copiar nada do produto de referência (eConexão):** nem layout, nem textos, nem ordem de perguntas, nem glossário, nem marca. Ver Seção 12\. Os rótulos desta spec são próprios.  
9. Idioma da UI: **pt-BR**. Moeda: BRL. Formato: `R$ 1.234,56`, `12,3%`, `45 dias`.  
10. Ao terminar cada fase do roadmap (Seção 10), rode a suíte completa e gere relatório de cobertura; critério de pronto está na própria seção.

---

## 1\. Visão do produto

**O que é:** aplicação web que, a partir de (a) dados dos últimos 12 meses de uma empresa e (b) seu balanço de abertura, **projeta os próximos 12 meses mês a mês**, gerando DRE, DFC, Balanço Patrimonial, \~30 indicadores e comparação de 3+ cenários.

**Para quem:** operador único (o dono do produto), analisando **várias empresas** (próprias e de terceiros, em regime de consultoria). Arquitetura pronta para múltiplos usuários no futuro (`owner_id` em tudo), mas **sem** multiusuário no MVP.

**Diferenciais em relação a simuladores de mercado:**

- Modelo integrado de 3 demonstrativos: **o Balanço fecha por construção em todos os meses** (caixa é resultado do DFC).  
- Aderência a normas: ativo contingente não reconhecido (CPC 25), classificação CP/LP de dívidas (CPC 26), receita líquida conforme CPC 47\.  
- Múltiplas dívidas com tabela Price/SAC, eventos planejados (capex, aportes, contratações, captações).  
- Reprodutibilidade: versões salvas guardam `engine_version` e resultado congelado.

**Fora de escopo (explicitamente):** escrituração contábil, plano de contas, lançamentos, conciliação bancária, emissão de NF, integração com ERP (v2+ talvez), colar bloco do Excel na grade (dispensado pelo dono), multiusuário.

---

## 2\. Decisões já tomadas (registro)

| \# | Decisão | Escolha | Implicação |
| :---- | :---- | :---- | :---- |
| D1 | Uso | Comercial / consultoria, operador único | Produto original; checklist legal Seção 12; LGPD aplica |
| D2 | Mês a mês | **Projeção** dos próximos 12 meses (não lançamento de histórico) | Histórico 12m \= calibração; BP atual \= t0 |
| D3 | Distribuição a sócios | **Fica na DRE** (abaixo do Lucro Líquido) | DRE mostra subtotal "Lucro antes da distribuição"; **indicadores usam esse subtotal** por padrão (config `baseIndicadores = 'antes_distribuicao'`) |
| D4 | Cliente | O próprio dono, várias empresas | Multiempresa, single-user |
| D5 | Hospedagem | **Local primeiro, migrar para nuvem** | Postgres desde o dia 1 (Docker local) → Supabase/Neon \+ Vercel |
| D6 | Linguagem | Em aberto → **decidido pela arquitetura: TypeScript ponta a ponta** | Motor roda no browser (prévia ao vivo) e no servidor (PDF/IA) sem duplicação |
| D7 | Grade estilo Excel com colar | Desnecessária | Tabela editável simples (TanStack Table). Import CSV/XLSX de template fica para v1 |
| D8 | Motor de fórmulas | Código TS puro \+ registro de metadados | Sem DSL, sem HyperFormula (licença GPL/comercial) |
| D9 | Ciclos | Proibidos por regra de ordenação (juros/rendimentos sobre saldo t−1) | Sem solver iterativo |

---

## 3\. Glossário de domínio e notação

| Símbolo | Significado |
| :---- | :---- |
| `t` | Mês da projeção, `t = 1..H` (H \= horizonte, default 12). `t = 0` \= balanço de abertura (data-base) |
| `X12` | Total dos últimos 12 meses informado no histórico |
| `_m` | Valor mensal; taxas `_m` são mensais |
| `RB` | Receita Bruta |
| `RL` | Receita Líquida \= RB − Descontos − Impostos sobre vendas |
| `MC` | Margem de Contribuição |
| `GF` | Gastos Fixos |
| `LAIR` | Lucro antes do IR/CSLL |
| `LL` | Lucro Líquido (antes da distribuição) |
| `CR` | Contas a Receber |
| `PDD` | Perdas estimadas com créditos (inadimplência) |
| `PMRE/PMRV/PMPC` | Prazos médios de estoque / recebimento / pagamento (dias) |
| `NCG/CDG/T` | Necessidade de Capital de Giro / Capital de Giro / Saldo de Tesouraria (modelo Fleuriet) |
| `idx_k` | Índice de sazonalidade do mês-calendário k (média dos 12 \= 1,0) |

Convenções globais (P, configuráveis em `simulacao.config`):

- Ano comercial: **360 dias**; mês: **30 dias**.  
- Conversão de taxa: `i_m = (1 + i_a)^(1/12) − 1`. Todo campo de taxa tem unidade explícita (`am` | `aa`).  
- Prazos médios no modo projeção mensal: **saldo final do mês** / fluxo do mês × 30\. Indicadores anuais: saldo final de t=12 / fluxo anual × 360\.  
- **Todas as taxas variáveis (CMV%, frete%) são calibradas sobre a RB** (proxy de volume). Margens são exibidas sobre RL.

---

## 4\. Especificação de INPUTS

Todos os inputs são validados por schema Zod (`packages/engine/src/schema.ts`). Obrigatório \= `*`. Faixas fora do limite "duro" bloqueiam; fora do "alerta" apenas avisam.

### 4.1 Cadastro da empresa (não entra no cálculo, exceto `regime`)

| id | Rótulo (UI) | Tipo | Validação |
| :---- | :---- | :---- | :---- |
| `razaoSocial`\* | Razão social | texto | 2–200 chars |
| `cnpj` | CNPJ | texto máscara | dígitos verificadores válidos |
| `segmento` | Segmento | lista: comércio, indústria, serviços, alimentação, saúde, outro | — |
| `regime`\* | Regime tributário | `simples` | `presumido` | `real` | `mei` | — |
| `atividadePresumido` | Atividade (p/ presunção) | `comercio_industria` | `servicos` | obrigatório se `regime = presumido` |
| `uf`, `cidade`, `anoInicio` | — | — | — |

### 4.2 Histórico — últimos 12 meses (calibração)

| id | Rótulo | Un. | Faixa dura | Alerta |
| :---- | :---- | :---- | :---- | :---- |
| `rb12`\* | Faturamento bruto 12m | R\$ | \> 0 | — |
| `pctVista`\* | % das vendas à vista (Pix/dinheiro/débito) | % | 0–100 | — |
| `pctPrazo`\* | % das vendas a prazo (boleto/crediário) | % | 0–100 | — |
| `pctCartao`\* | % das vendas no cartão de crédito | % | 0–100 | — |
| **regra** | `pctVista + pctPrazo + pctCartao = 100` (tolerância 0,01) |  | **bloqueia** |  |
| `descVista` | Desconto médio nas vendas à vista | % | 0–50 | \> 15 |
| `prazoRecebDias`\* | Prazo médio de recebimento das vendas a prazo | dias | 0–360 | \> 120 |
| `prazoCartaoDias` | Prazo de recebimento do cartão (sem antecipação) | dias | 0–360, default 30 | — |
| `taxaCartao` | Taxa média do cartão (MDR) | % | 0–15 | \> 6 |
| `pctAntecipado` | % dos recebíveis (prazo+cartão) antecipados | % | 0–100 | — |
| `taxaAntecipacao` | Taxa de antecipação | % a.m. | 0–10 | \> 4 |
| `pctInadimplencia` | Inadimplência sobre vendas a prazo | % | 0–50 | \> 10 |
| `pctComissao`\* | Comissão média sobre vendas | % | 0–30 | — |
| `compras12`\* | Compras de mercadoria/insumos 12m | R\$ | ≥ 0 | \> rb12 |
| `prazoPagFornecDias`\* | Prazo médio de pagamento a fornecedores | dias | 0–360 | \> 120 |
| `frete12` | Logística/frete 12m | R\$ | ≥ 0 | — |
| `impVendas12` | Impostos sobre vendas 12m (DAS no Simples) | R\$ | ≥ 0 | alíquota efetiva \> 30% |
| `irCsll12` | IR/CSLL pagos 12m | R\$ | ≥ 0 | \> 0 com `regime ∈ {simples, mei}` → alerta de dupla contagem |
| `folha12`\* | Folha completa com encargos 12m | R\$ | ≥ 0 | — |
| `temporarios12` | Mão de obra temporária 12m | R\$ | ≥ 0 | — |
| `proLabore12` | Pró-labore dos sócios 12m (despesa) | R\$ | ≥ 0 | — |
| `fixos12`\* | Demais gastos fixos (aluguel, energia, sistemas…) 12m | R\$ | ≥ 0 | — |
| `marketing12` | Marketing/mídia 12m | R\$ | ≥ 0 | — |
| `distribuicao12` | Distribuição de lucros aos sócios 12m | R\$ | ≥ 0 | — |
| `dasMei_m` | DAS mensal (só MEI) | R\$ | ≥ 0 | — |

> ⚠ Nota: separar `proLabore12` (despesa, entra em GF) de `distribuicao12` (linha abaixo do LL). Se o usuário não souber separar, tudo vai em `distribuicao12` e a UI mostra aviso.

### 4.3 Balanço de abertura (t \= 0, data-base)

| id | Rótulo | Un. | Observação |
| :---- | :---- | :---- | :---- |
| `caixa0`\* | Saldo em contas correntes | R\$ | pode ser 0 |
| `aplicacoes0` | Aplicações financeiras | R\$ |  |
| `taxaAplicacao` \+ unidade | Rendimento das aplicações | % |  |
| `cr0` | Contas a receber (saldo) | R\$ | se vazio: estimado (Seção 5.4) |
| `estoque0` | Estoque (a custo) | R\$ |  |
| `imobilizado0` | Máquinas, móveis, veículos, equipamentos | R\$ | valor atual estimado (P: gerencial) |
| `vidaUtilMeses` | Vida útil restante do imobilizado | meses | \> 0 se `imobilizado0 > 0` |
| `imoveis0` | Imóveis da empresa | R\$ |  |
| `pctEdificacao` | % do valor do imóvel que é edificação | % | default 0 (terreno não deprecia) |
| `intangivel0` | Intangível (software, marcas, fundo de comércio) | R\$ |  |
| `vidaUtilIntangivelMeses` | Prazo de amortização | meses | 0 \= não amortiza |
| `capitalSocial`\* | Capital integralizado pelos sócios | R\$ |  |
| `dividas[]` | Lista de dívidas | — | Seção 4.4 |
| `contingencias[]` | Lista de processos | — | Seção 4.5 |
| `taxaChequeEspecial` \+ unidade | Juros de saldo negativo | % | default 8% a.m. |

### 4.4 Dívida (1..N)

| campo | tipo | regra |
| :---- | :---- | :---- |
| `tipo` | `bancaria` | `tributaria` |  |
| `descricao` | texto |  |
| `saldo` | R\$ \> 0 |  |
| `taxa`, `unidadeTaxa` | %, `am`|`aa` | tributária: Selic (default parametrizado) |
| `prazoMeses` | int \> 0 |  |
| `sistema` | `price` | `sac` | `bullet` | default `price` (bancária), `sac` (tributária) |
| `carenciaMeses` | int ≥ 0 | juros pagos na carência |
| `mesInicio` | int ≥ 0 | 0 \= existente; \> 0 \= captação planejada (entra caixa no mês) |
| `parcelada` | bool | só tributária; `false` ⇒ 100% no CP, acumula Selic, sem amortização |

### 4.5 Contingência (0..N)

| campo | tipo |
| :---- | :---- |
| `natureza` | `trabalhista` | `civel` | `tributaria` |
| `polo` | `passivo` (contra a empresa) | `ativo` (a favor) |
| `valor` | R\$ |
| `probabilidade` | `provavel` | `possivel` | `remota` |
| `mesDesfecho` | int opcional — mês do desembolso/recebimento |

### 4.6 Premissas de projeção

| id | Rótulo | Un. | Default |
| :---- | :---- | :---- | :---- |
| `crescimentoReceita` | Crescimento da receita | % a.m. | 0 |
| `sazonalidade[12]` | Índice por mês-calendário (Jan..Dez) | fator | todos 1,0 (validação: média \= 1 ± 0,001; UI normaliza) |
| `inflacaoCustos` | Reajuste dos gastos fixos | % a.a. | 0 |
| `marketingModo` | `valor` (marketing12/12) | `pctRB` |  | `valor` |
| `aliquotaVendasPorMes[H]` | Override da alíquota efetiva por mês | % | vazio (usa calibrada) — **necessário para reforma tributária (CBS/IBS) — ver Seção 13** |
| `eventos[]` | Eventos planejados | — | Seção 4.7 |
| `overrides[driver][t]` | Sobrescrita manual de célula | R\$/% | Seção 5.2 |

### 4.7 Eventos

| tipo | parâmetros | efeito |
| :---- | :---- | :---- |
| `capex` | valor, mes, vidaUtilMeses | \+Imobilizado, −Caixa (FCI), depreciação a partir de t+1 |
| `aporte` | valor, mes | \+Capital social, \+Caixa (FCF) |
| `contratacao` | custoMensalComEncargos, mes | \+Folha a partir do mês |
| `reajusteFolha` | pct, mes | Folha × (1+pct) a partir do mês |
| `vendaAtivo` | valorVenda, valorContabil, mes | \+Caixa, −Imobilizado, ganho/perda em "Outras receitas/despesas" (v1) |
| `pagamentoContingencia` | — | derivado de `contingencias[].mesDesfecho` |

### 4.8 Cenários (alavancas)

| id | Rótulo | Un. | Aplicação |
| :---- | :---- | :---- | :---- |
| `dReceita` | Variação da receita | % | `RB_t × (1 + dReceita)` |
| `dVariaveis` | Variação dos custos variáveis | % | multiplica **alíquotas**: cmv%, frete%, pctComissao, taxaCartao, aliquota vendas. Nunca valores absolutos |
| `dFixos` | Variação dos gastos fixos | % | GF × (1+dFixos). **Não** afeta distribuição |
| `dDistribuicao` | Variação da distribuição | % | separado de `dFixos` |
| `dInadimplencia` | Variação da inadimplência | **p.p.** | `pctInadimplencia + dInad` (clamp 0–100) |
| `dJuros` | Variação dos juros | % | taxa × (1+dJuros) em dívidas bancárias e cheque especial |
| `dPrazoReceb` | Dias a mais/menos para receber | dias | `prazoRecebDias + d` (clamp ≥ 0\) |
| `dPrazoPag` | Dias a mais/menos para pagar | dias | `PMPC + d` (clamp ≥ 0\) |

Cenários padrão (P, editáveis): **Atual** \= todas 0 (travado). **Pessimista**: receita −15%, variáveis \+10%, fixos \+8%, inad \+2 p.p., juros \+10%, receb \+10d, pag −5d. **Otimista**: receita \+15%, variáveis −7%, fixos −5%, inad −1 p.p., juros −10%, receb −5d, pag \+5d. Permitir N cenários `custom`.

---

## 5\. Calibração e drivers de projeção

### 5.1 Calibração (a partir do histórico 12m) — executa uma vez por simulação

desc12      \= rb12 × pctVista × descVista

baseImp12   \= rb12 − desc12

aliqVendas  \= impVendas12 / baseImp12                    (P) ; MEI: 0

cmvPct      \= compras12 / rb12                           (P) supõe estoque estável: CMV12 ≈ compras12

fretePct    \= frete12 / rb12                             (P)

cmv12       \= compras12

PMRE0       \= estoque0 / (cmv12 / 360\)                   (R) ; null se cmv12 \= 0

PMPC0       \= input prazoPagFornecDias\*                  ← campo do histórico (dias)

gfBase\_m    \= (folha12 \+ temporarios12 \+ proLabore12 \+ fixos12 \+ \[marketing12 se modo=valor\]) / 12

distrib\_m   \= distribuicao12 / 12

> `prazoPagFornecDias` está definido em 4.2.

### 5.2 Precedência de drivers (P, regra fixa)

Para cada driver `d` no mês `t`:

valor(d,t) \= override\[d\]\[t\]            se existir

           ? senão evento aplicável     (soma/multiplica sobre a base)

           : base(d) × fatorCrescimento(d,t) × fatorCenario(d)

### 5.3 Receita

k(t)   \= mês-calendário de (dataBase \+ t meses)

RB\_t   \= (rb12/12) × (1 \+ crescimentoReceita)^t × idx\_k(t) × (1 \+ dReceita)

Vista\_t  \= RB\_t × pctVista ;  Prazo\_t \= RB\_t × pctPrazo ;  Cartao\_t \= RB\_t × pctCartao

### 5.4 Recebimentos (mecânica de caixa das vendas)

Defasagem em meses com split fracionário (P):

lag(dias) → L \= dias/30 ; a \= floor(L) ; f \= L − a

  fração (1−f) recebida em t+a ; fração f recebida em t+a+1

- **À vista:** recebe em `t` o valor `Vista_t − Desc_t`.  
- **A prazo:** valor bruto `Prazo_t`.  
  - Parcela antecipada `Prazo_t × pctAntecipado` → recebe em `t` líquida do custo de antecipação.  
  - Restante `Prazo_t × (1 − pctAntecipado)` → recebe conforme `lag(prazoRecebDias + dPrazoReceb)`, **multiplicado por (1 − inad)**; a parte `inad` é baixada contra a PDD no vencimento.  
- **Cartão:** idem, com `lag(prazoCartaoDias)`, líquido de `taxaCartao` (sem inadimplência).  
- **Custo de antecipação** (R: despesa financeira): `CustoAnt_t = (Prazo_t + Cartao_t) × pctAntecipado × taxaAntecipacao_m × (prazoMedioAntecipado/30)` onde `prazoMedioAntecipado` \= prazo ponderado do respectivo canal.  
- **CR de abertura** `cr0`: liquidado linearmente em `ceil(prazoRecebDias/30)` meses (P). Se `cr0` vazio: `cr0 = (rb12/360) × (pctPrazo × prazoRecebDias + pctCartao × prazoCartaoDias) × (1 − pctAntecipado)`.

### 5.5 Estoque, CMV, compras, fornecedores

CMV\_t      \= RB\_t × cmvPct × (1 \+ dVariaveis)

EstFinal\_t \= CMV\_t × PMRE0 / 30                          (P: mantém dias de estoque)

Compras\_t  \= CMV\_t \+ EstFinal\_t − EstFinal\_{t−1}         (R) ; EstFinal\_0 \= estoque0

Pagamento de compras: lag(PMPC0 \+ dPrazoPag) sobre Compras\_t

Fornecedores0 \= (compras12/360) × PMPC0 ; liquidado linear em ceil(PMPC0/30) meses

Fornecedores\_t \= Σ compras ainda não pagas               (R)

Se `Compras_t < 0` (queda brusca de vendas): permitido (redução de estoque sem compra) → `Compras_t = max(0, ·)` e `EstFinal_t = EstFinal_{t−1} − CMV_t`, clamp 0\. (P)

### 5.6 Despesas e contas a pagar

| Item | Competência (DRE) em t | Pagamento (caixa) |
| :---- | :---- | :---- |
| Impostos s/ vendas | `(RB_t − Desc_t) × aliqVendas_t × (1+dVariaveis)` | t+1 |
| Comissão | `(RB_t − Desc_t) × pctComissao × (1+dVariaveis)` | t+1 |
| Taxa cartão | `Cartao_t × taxaCartao × (1+dVariaveis)` | retida na liquidação (reduz o recebimento) |
| Frete | `RB_t × fretePct × (1+dVariaveis)` | t |
| Perdas (PDD) | `Prazo_t × (1−pctAntecipado) × inad` | não-caixa (constitui PDD) |
| Folha \+ temporários \+ pró-labore | base/12 × reajustes/eventos × (1+dFixos) | t+1 |
| Fixos \+ marketing | base/12 × (1+inflacao\_m)^t × (1+dFixos) | t |
| IR/CSLL | Seção 6.6 | t+1 |
| Distribuição | `distrib_m × (1+dDistribuicao)` | t |

`ContasAPagar_t` \= soma dos itens "t+1" competência t (R: regime de competência). `ContasAPagar_0` \= 1/12 de (impVendas12 \+ comissão estimada \+ folha12 \+ temporarios12 \+ proLabore12 \+ irCsll12). (P)

---

## 6\. Motor de cálculo

### 6.1 Regra anticiclo (INVIOLÁVEL)

> Um valor do mês `t` só pode depender de: (i) inputs/calibração, (ii) qualquer valor de `t−1`, (iii) valores de `t` calculados **antes** na ordem da Seção 6.2.

Consequências obrigatórias: juros de dívida, receita de aplicação e juros de cheque especial incidem sobre **saldo de t−1**. Captação em `t` gera juros a partir de `t+1`.

Implementação: cada etapa é uma função `(ctx: Ctx, prev: EstadoMes, cur: ParcialMes) => ParcialMes`. O tipo `ParcialMes` é construído incrementalmente; o TypeScript impede ler campo ainda não calculado (use tipos progressivos / builder).

### 6.2 Pipeline

calcular(entrada, cenario, cfg):

  1\. validar(entrada)                       → erros bloqueantes | alertas

  2\. cal \= calibrar(entrada.historico)      → Seção 5.1

  3\. drv \= aplicarCenario(cal, cenario)     → Seção 4.8

  4\. m0  \= abertura(entrada.abertura, cal)  → Seção 6.8 (plug t0)

  5\. for t in 1..H:

       a. receita \+ descontos \+ impostos s/ vendas

       b. CMV, estoque, compras

       c. despesas variáveis (comissão, cartão, frete, PDD)

       d. gastos fixos (com eventos)

       e. depreciação/amortização

       f. dívidas: juros e amortização (saldo t−1) \+ captações

       g. receita financeira (aplicações t−1) ; juros cheque especial (caixa t−1 \< 0\)

       h. custo de antecipação

       i. LAIR → IR/CSLL → LL → distribuição

       j. recebimentos/pagamentos (filas de defasagem)

       k. DFC

       l. BP

       m. checagens

  6\. indicadores(meses) mensais \+ anuais (Σ 1..12)

  7\. alertas(meses)

  return Resultado

### 6.3 DRE (mensal; anual \= soma)

| \# | Linha | Fórmula | Tipo |
| :---- | :---- | :---- | :---- |
| 1 | Receita Bruta | `RB_t` | R |
| 2 | (−) Descontos concedidos | `Vista_t × descVista` | R |
| 3 | (−) Impostos sobre vendas | Seção 5.6 | R |
| 4 | **\= Receita Líquida** | 1 − 2 − 3 | **R** |
| 5 | (−) CMV | `CMV_t` | R |
| 6 | (−) Comissões | Seção 5.6 | R (classificação: despesa variável) |
| 7 | (−) Taxas de cartão | Seção 5.6 | R |
| 8 | (−) Frete/logística | Seção 5.6 | P |
| 9 | (−) Perdas com inadimplência | Seção 5.6 | R |
| 10 | **\= Margem de Contribuição** | 4 − (5..9) | R |
| 11 | (−) Pessoal (folha+temporários+pró-labore) | Seção 5.6 | R |
| 12 | (−) Gastos fixos gerais | Seção 5.6 | R |
| 13 | (−) Marketing | Seção 5.6 | P (fixo) |
| 14 | (−) DAS MEI | só MEI | R |
| 15 | **\= EBITDA** | 10 − (11..14) | R |
| 16 | (−) Depreciação e amortização | 6.5 | R |
| 17 | **\= EBIT (resultado operacional)** | 15 − 16 | R |
| 18 | (−) Despesas financeiras | juros dívidas \+ juros tributária \+ cheque especial \+ antecipação | R |
| 19 | (+) Receitas financeiras | `aplic_{t−1} × i_apl_m` | R |
| 20 | **\= LAIR** | 17 − 18 \+ 19 | R |
| 21 | (−) IR/CSLL | 6.6 | R |
| 22 | **\= Lucro antes da distribuição (LL)** | 20 − 21 | **R** |
| 23 | (−) Distribuição aos sócios | Seção 5.6 | **P (D3)** — contabilmente é movimento de PL |
| 24 | **\= Resultado após distribuição** | 22 − 23 | P |

Análise vertical: cada linha ÷ RB (coluna "% RB") e ÷ RL (coluna "% RL"). Ambas exibidas; toggle na UI.

### 6.4 Dívidas (por dívida `d`, taxa mensal `i`, saldo `S`)

| Sistema | Parcela/Amortização | Tipo |
| :---- | :---- | :---- |
| Price | `PMT = S0·i / (1 − (1+i)^−n)` ; `J_t = S_{t−1}·i` ; `A_t = PMT − J_t` | R |
| Price com i \= 0 | `A_t = S0/n` (evitar 0/0) | R |
| SAC | `A_t = S0/n` ; `J_t = S_{t−1}·i` | R |
| Bullet | `J_t = S_{t−1}·i` ; `A_n = S0` | R |
| Carência `c` | meses 1..c: só juros ; amortização recalculada sobre `n − c` | R |
| Tributária não parcelada | `S_t = S_{t−1}·(1+i)` ; sem pagamento | P |

Para dívida existente (`mesInicio = 0`), `S0 = saldo` e `n = prazoMeses` restantes a partir de t=1. **Classificação no BP (R, CPC 26):** `CP_t = Σ A_{t+1..t+12}` ; `LP_t = S_t − CP_t`. Tributária não parcelada: `CP_t = S_t`.

**Exemplo de teste (Price):** S0 \= 100.000, i \= 2% a.m., n \= 12 → PMT \= **9.455,96**; t1: J \= 2.000,00, A \= 7.455,96, S \= 92.544,04; t2: J \= 1.850,88, A \= 7.605,08, S \= 84.938,96; t3: J \= 1.698,78, A \= 7.757,18, S \= 77.181,78. No t0: CP \= 100.000, LP \= 0\.

### 6.5 Depreciação e amortização (linear, P)

depImob\_t   \= imobilizado0 / vidaUtilMeses              enquanto acumulada \< imobilizado0

depImovel\_t \= imoveis0 × pctEdificacao / 300            (25 anos; terreno não deprecia — R)

amortInt\_t  \= intangivel0 / vidaUtilIntangivelMeses     (se \> 0\)

capex e     \= valor\_e / vidaUtil\_e a partir de mes\_e \+ 1

### 6.6 IR/CSLL por regime

Parâmetros fiscais **não podem ser hardcoded**: tabela `parametro_fiscal` com vigência (Seção 8). Valores iniciais abaixo — **⚠ validar com contador antes do release**.

| Regime | Cálculo mensal (aproximação gerencial) | Tipo |
| :---- | :---- | :---- |
| `mei` | 0 (DAS fixo na linha 14\) | R |
| `simples` | 0 (IRPJ/CSLL já dentro do DAS em "Impostos s/ vendas") | R |
| `presumido` | `basePres = (RB_t − Desc_t) × presIRPJ` (8% comércio/indústria; 32% serviços) ; `IRPJ = 15%·basePres + 10%·max(0, basePres − 20.000)` ; `CSLL = 9% × (RB_t − Desc_t) × presCSLL` (12% / 32%) | R (simplif. mensal do adicional trimestral: P) |
| `real` | `IRPJ = 15%·max(0,LAIR) + 10%·max(0, LAIR − 20.000)` ; `CSLL = 9%·max(0,LAIR)` ; compensação de prejuízo fiscal limitada a 30% (v1) | R |
| Modo "informado" (MVP) | `irCsll12/12` fixo | P — fallback do MVP |

### 6.7 Caixa negativo

Caixa pode ficar negativo (não há captação automática). Se `Caixa_{t−1} < 0`: `JurosCheque_t = −Caixa_{t−1} × taxaChequeEspecial_m × (1 + dJuros)` → linha 18\. Alerta crítico no mês.

### 6.8 Balanço Patrimonial

| Grupo | Conta | t \= 0 | t ≥ 1 | Tipo |
| :---- | :---- | :---- | :---- | :---- |
| AC | Caixa | `caixa0` | `Caixa_{t−1} + ΔCaixa_DFC_t` | **R (fechamento pelo DFC)** |
| AC | Aplicações | `aplicacoes0` | `Aplic_{t−1} + RecFin_t` (reinvestida) | P |
| AC | Contas a receber (bruto) | `cr0` | fila de recebíveis a prazo+cartão não antecipados | R |
| AC | (−) PDD | 0 | PDD acumulada ainda não baixada | R |
| AC | Estoque | `estoque0` | `EstFinal_t` | R |
| ANC | Imobilizado líquido | `imobilizado0 + imoveis0` | bruto \+ capex − dep. acumulada | R |
| ANC | Intangível líquido | `intangivel0` | − amortização acumulada | R |
| — | Ações a receber (contingência ativa) | **não reconhecer** | só nota "Ativos contingentes" | **R (CPC 25\)** |
| PC | Fornecedores | `Fornecedores0` | fila de compras | R |
| PC | Contas a pagar (impostos, comissões, folha, IR) | `ContasAPagar_0` | Seção 5.6 | R |
| PC | Empréstimos CP | Σ dívidas bancárias `CP_t` |  | R |
| PC | Parcelamentos tributários CP | Σ tributárias `CP_t` |  | R |
| PC | Provisões CP | contingências `provavel` com `mesDesfecho ≤ t+12` |  | R |
| PNC | Empréstimos LP / Parcelamentos LP | `LP_t` |  | R |
| PNC | Provisões LP | `provavel` sem desfecho em 12 meses |  | R |
| — | Contingências `possivel` | não reconhecer; nota |  | R |
| PL | Capital social | `capitalSocial` | \+ aportes | R |
| PL | Lucros/prejuízos acumulados | **PLUG0 \= Ativo0 − Passivo0 − Capital** | `LA_{t−1} + LL_t − Distribuição_t` | R |

`PLUG0` é o **único** fechamento do modelo. Exibir na UI como "Resultados acumulados (estimado pelo balanço de abertura)" com tooltip explicando.

### 6.9 DFC — método indireto

FCO\_t \= LL\_t \+ Dep\_t \+ PDD\_t(despesa)

        − ΔCR\_bruto\_t − ΔEstoque\_t

        \+ ΔFornecedores\_t \+ ΔContasAPagar\_t \+ ΔProvisões\_t

        − PagamentoContingência\_t (se não provisionada)

FCI\_t \= − Capex\_t \+ VendaAtivo\_t − ΔAplicacoes\_t (reinvestimento de rendimento)

FCF\_t \= \+ Captações\_t − Amortizações\_t(todas) \+ Aportes\_t − Distribuição\_t

ΔCaixa\_t \= FCO\_t \+ FCI\_t \+ FCF\_t

(Juros pagos ficam no FCO via LL; P, convenção CPC 03 permite.)

### 6.10 Indicadores

Base de LL para indicadores \= `cfg.baseIndicadores` (default `'antes_distribuicao'` \= linha 22). Mensais: fluxos do mês; anuais: Σ t=1..12 e saldos de t=12 (médios quando indicado).

| id | Nome | Fórmula | null quando | Tipo |
| :---- | :---- | :---- | :---- | :---- |
| `rbMensal` | Faturamento mensal médio | ΣRB/12 | — | R |
| `gvPct` | Gasto variável total | (linhas 3+5+6+7+8+9)/RB | RB=0 | P (inclui impostos) |
| `mcPct` | Margem de contribuição | MC/RL | RL≤0 | R |
| `ebitdaPct` | Margem EBITDA | EBITDA/RL | RL≤0 | R |
| `ebitPct` | Margem operacional | EBIT/RL | RL≤0 | R |
| `mlPct` | Margem líquida | LL/RL | RL≤0 | R |
| `pec` | Ponto de equilíbrio contábil (R\$ RL/mês) | (GF \+ Dep)/mcPct | mcPct≤0 | **R** |
| `pecRB` | PEC em faturamento | pec / (RL/RB) | idem | P |
| `pef` | Ponto de equilíbrio financeiro | (GF \+ Juros \+ Amortizações − Dep)/mcPct | mcPct≤0 | R |
| `mso` | Margem de segurança | (RL − pec)/RL | RL≤0 | R |
| `gao` | Alavancagem operacional | MC/EBIT | EBIT≤0 | **R** |
| `pmre` | Prazo médio de estoque | Estoque/CMV × dias | CMV=0 | R |
| `pmrv` | Prazo médio de recebimento | CR\_bruto/RB × dias | RB=0 | R (hipótese A: RB total) |
| `pmpc` | Prazo médio de pagamento | Fornecedores/Compras × dias | Compras=0 | R |
| `co` | Ciclo operacional | pmre \+ pmrv | algum null | R |
| `cf` | Ciclo financeiro | co − pmpc | idem | R |
| `ncg` | NCG | (CR − PDD \+ Estoque) − (Fornecedores \+ ContasAPagar) | — | R |
| `ncgDias` | NCG em dias de venda | ncg/(RB/dias) | RB=0 | R |
| `cdg` | Capital de giro | (PL \+ PNC) − ANC | — | R |
| `tesouraria` | Saldo de tesouraria | cdg − ncg | — | R |
| `lc` | Liquidez corrente | AC/PC | PC=0 | R |
| `ls` | Liquidez seca | (AC − Estoque)/PC | PC=0 | R |
| `li` | Liquidez imediata | (Caixa \+ Aplic)/PC | PC=0 | R |
| `lg` | Liquidez geral | AC/(PC \+ PNC) | \=0 | R |
| `runway` | Autonomia de caixa (meses) | (Caixa+Aplic)/queimaMédia ; queima \= −média(FCO \+ FCF\_dívida) dos últimos 3 meses | queima ≤ 0 → `'nao_queima'` | P |
| `dlEbitda` | Dívida líquida/EBITDA | (Empréstimos \+ Parcelamentos − Caixa − Aplic)/EBITDA12 | EBITDA≤0 | R/P (inclui tributária) |
| `icj` | Cobertura de juros | EBIT/Juros (exibir também EBITDA/Juros) | Juros=0 | R |
| `endiv` | Endividamento geral | (PC+PNC)/Ativo | Ativo=0 | R |
| `ipl` | Imobilização do PL | (Imob+Intang)/PL | PL≤0 | R |
| `roe` | ROE | LL12/PL médio | PL médio≤0 | R |
| `roa` | ROA | EBIT×(1−tEf)/Ativo médio | Ativo=0 | R |
| `roic` | ROIC | EBIT×(1−tEf)/(ncg \+ Imob \+ Intang) | CI≤0 | R/P |
| `spread` | Spread | roic − kd×(1−tEf) ; kd \= Juros12/Dívida média | dívida=0 | P |
| `gfRl` | Gastos fixos / RL | GF/RL | RL≤0 | R |
| `custoVender` | Custo de vender | (Comissão \+ Cartão \+ Antecipação \+ Frete \+ Marketing)/RB | RB=0 | P |
| `giroEstoque` | Giro do estoque | CMV12/Estoque médio | est=0 | R |

`tEf` \= IR12/LAIR12 (clamp 0–1; Simples/MEI \= 0). `dias` \= 30 (mensal) ou 360 (anual).

### 6.11 Exemplo verificável (teste unitário da DRE — um mês)

Premissas: RB \= 100.000; pctVista 40%, descVista 5%; aliqVendas 6%; cmvPct 40%; comissão 3%; pctCartao 30%, taxaCartao 3%; fretePct 2%; pctPrazo 30%, pctAntecipado 0, inad 2%; GF 30.000; Dep 1.000; DespFin 2.000; RecFin 500\.

| Linha | Valor esperado |
| :---- | :---- |
| Descontos | 2.000,00 |
| Impostos s/ vendas | 5.880,00 |
| Receita Líquida | 92.120,00 |
| CMV | 40.000,00 |
| Comissões | 2.940,00 |
| Taxa cartão | 900,00 |
| Frete | 2.000,00 |
| Perdas inadimplência | 600,00 |
| Margem de Contribuição | 45.680,00 |
| EBITDA | 15.680,00 |
| EBIT | 14.680,00 |
| LAIR | 13.180,00 |
| mcPct | 49,59% |
| PEC (RL) | 62.515,76 |
| GAO | 3,11 |

### 6.12 Checagens (falha \= bug; bloqueia CI)

| id | Regra (todo t \= 0..H) |
| :---- | :---- |
| `C1_balanco` | |Ativo − (Passivo \+ PL)| \< EPS |
| `C2_caixa` | |ΔCaixa\_BP − ΔCaixa\_DFC| \< EPS |
| `C3_tesouraria` | |(cdg − ncg) − ((Caixa \+ Aplic) − (EmpCP \+ ParcCP \+ ProvCP))| \< EPS. Identidade decorre de C1 dado que PC \= Fornecedores \+ ContasAPagar \+ EmpCP \+ ParcCP \+ ProvCP (provisões tratadas como passivo errático/financeiro — Fleuriet) |
| `C4_dividas` | Σ amortizações \= saldo inicial − saldo final, por dívida |
| `C5_mix` | pctVista \+ pctPrazo \+ pctCartao \= 100 |
| `C6_cenarioNeutro` | cenário com alavancas 0 ≡ Atual (deep-equal) |
| `C7_estoque` | EstFinal\_{t−1} \+ Compras\_t − CMV\_t \= EstFinal\_t |
| `C8_lucrosAcum` | LA\_t \= LA\_{t−1} \+ LL\_t − Distrib\_t |
| `C9_semNaN` | nenhum `NaN`/`Infinity` em todo o Resultado |

### 6.13 Alertas de negócio (não bloqueiam)

| id | Condição | Nível |
| :---- | :---- | :---- |
| `A_caixaNegativo` | Caixa\_t \< 0 | crítico (informar 1º mês) |
| `A_plNegativo` | PL\_t \< 0 | crítico |
| `A_servicoDivida` | (Juros+Amort)\_t \> EBITDA\_t | atenção |
| `A_runway` | runway \< 3 | crítico ; \< 6 atenção |
| `A_mcNegativa` | MC\_t \< 0 | crítico |
| `A_duplaIR` | regime ∈ {simples, mei} e irCsll12 \> 0 | atenção |
| `A_estoqueZerado` | EstFinal\_t \= 0 com CMV \> 0 | atenção |
| `A_tributariaNaoParcelada` | existe | atenção |
| `A_aliquotaReforma` | horizonte cruza 01/2027 sem override de alíquota | info (Seção 13\) |

### 6.14 Registro de metadados (documentação executável)

`packages/engine/src/registry.ts` exporta, para cada linha de DRE/BP/DFC e cada indicador:

{ id, rotulo, formulaLegivel, dependeDe: string\[\], tipo: 'R'|'P', unidade: 'BRL'|'pct'|'dias'|'meses'|'x', nullQuando?: string, glossario: string }

Usos: tooltip "de onde vem este número", aba Glossário, teste que garante que todo campo do `Resultado` tem entrada no registro (e vice-versa).

---

## 7\. Arquitetura

### 7.1 Camadas

\[UI Next.js/React\]  wizard de premissas · tabela mensal editável · abas de resultado · PDF

        │ (inputs)                         ▲ (Resultado, formatado)

        ▼                                  │

\[Validação Zod\] ──► \[ENGINE puro TS\] ──────┘   ← mesmo pacote no browser (prévia ao vivo, debounce 150 ms)

        │                                        e no servidor (PDF, IA, versão congelada)

        ▼

\[API (Route Handlers)\] ──► \[Drizzle ORM\] ──► \[Postgres\]

        │

        └─► \[Serviço Conclusão IA\] (recebe Resultado JSON; nunca calcula)

Princípios: (1) persistir **só inputs e versões**; resultado vivo é recalculado; (2) `engine_version` semver — mudança de fórmula \= minor/major \+ atualização dos golden tests; (3) motor \< 20 ms para H \= 12 com 10 dívidas (meta; medir em CI).

### 7.2 Stack

| Camada | Escolha | Por quê | Alternativa rejeitada |
| :---- | :---- | :---- | :---- |
| Linguagem | **TypeScript** (strict) | Motor único para browser e servidor | Python: exigiria round-trip ao servidor a cada tecla ou motor duplicado |
| Monorepo | **pnpm workspaces** | `packages/engine` isolado e testável | — |
| Front \+ API | **Next.js (App Router)** | Um só deploy; Route Handlers como API; roda local e na Vercel | Vite SPA \+ Express (2 deploys) |
| UI | **Tailwind \+ shadcn/ui** (MIT) | Componentes acessíveis, sem licença | — |
| Tabela mensal | **TanStack Table** (MIT) \+ inputs controlados | Grade de \~20 drivers × 12 meses; colar do Excel dispensado (D7) | Handsontable (licença comercial paga), AG Grid Enterprise |
| Formulários | **react-hook-form \+ Zod** | Mesmo schema do motor | — |
| Gráficos | **Recharts** (MIT) ou ECharts (Apache-2.0) | Linha (caixa), barras (DRE), cascata (MC→LL) | — |
| ORM | **Drizzle** | Tipado, migrações SQL legíveis, Postgres local e nuvem | Prisma (ok também) |
| Banco | **Postgres 16** — local via Docker; nuvem: Supabase ou Neon | Evita migração SQLite→Postgres (D5) | SQLite |
| Auth | MVP local: nenhuma (bind em `127.0.0.1`). Nuvem: **Supabase Auth** ou Auth.js (magic link) | Single-user | — |
| PDF | MVP: página `/relatorio` com CSS de impressão (`window.print`). v1: **@react-pdf/renderer** no servidor | Sem Chromium no serverless | Puppeteer na Vercel (pesado) |
| Testes | **Vitest** \+ **fast-check** (property-based) \+ **Playwright** (E2E) |  | Jest |
| IA conclusão | Google Gemini via Supabase Edge Function `gerar-conclusao` (chave no secret `GEMINI_API_KEY` do Supabase, nunca no app) |  | — |
| Lint/format | ESLint \+ Prettier ; `tsc --noEmit` em CI |  |  |
| CI | GitHub Actions: lint → typecheck → test engine (cobertura ≥ 95% linhas no engine) → E2E |  |  |

### 7.3 Estrutura do repositório

/

├─ apps/web/                      \# Next.js

│  ├─ app/(app)/empresas/...      \# CRUD empresas

│  ├─ app/(app)/simulacoes/\[id\]/  \# editor \+ resultados

│  ├─ app/(app)/relatorio/\[versaoId\]/  \# página de impressão

│  ├─ app/api/...                 \# route handlers

│  ├─ components/                 \# UI

│  └─ lib/db/ (schema drizzle, migrations)

├─ packages/engine/

│  ├─ src/schema.ts               \# Zod: EntradaSimulacao, Alavancas, Config

│  ├─ src/calibrar.ts

│  ├─ src/cenario.ts

│  ├─ src/abertura.ts

│  ├─ src/etapas/\*.ts             \# receita, cmvEstoque, despesas, depreciacao, dividas, financeiro, ir, filas, dfc, bp

│  ├─ src/indicadores.ts

│  ├─ src/checagens.ts

│  ├─ src/alertas.ts

│  ├─ src/registry.ts

│  ├─ src/index.ts                \# export calcular()

│  └─ test/ (unit, property, golden/\*.json)

├─ packages/fiscal/               \# parâmetros fiscais versionados (seed da tabela)

├─ docs/SPEC.md                   \# ESTE arquivo

├─ docs/CHANGELOG-SPEC.md

└─ docker-compose.yml             \# postgres local

### 7.4 Contrato público do motor

export const ENGINE\_VERSION \= '1.0.0'

export function calcular(entrada: EntradaSimulacao, alavancas: Alavancas, cfg?: Partial\<Config\>): Resultado

export function calcularCenarios(entrada: EntradaSimulacao, cenarios: Cenario\[\], cfg?: Partial\<Config\>): Record\<string, Resultado\>

interface Config {

  diasAno: 360 | 365

  baseIndicadores: 'antes\_distribuicao' | 'apos\_distribuicao'   // default antes (D3)

  modoIR: 'informado' | 'regime'                                  // MVP: informado

  horizonte: number                                               // default 12

}

interface Resultado {

  engineVersion: string

  meses: Mes\[\]                      // \[0..H\]

  anual: { dre: DRE; dfc: DFC }     // Σ 1..H (se H=12)

  indicadores: { porMes: Indicadores\[\]; anual: Indicadores }

  checagens: { id: string; mes: number; ok: boolean; delta: number }\[\]

  alertas: { id: string; mes?: number; nivel: 'info'|'atencao'|'critico'; mensagem: string }\[\]

  notas: { ativosContingentes: Contingencia\[\]; passivosPossiveis: Contingencia\[\] }

}

interface Mes { t: number; competencia: string /\* 'YYYY-MM' \*/; dre: DRE; bp: BP; dfc: DFC; dividas: LinhaDivida\[\] }

### 7.5 API (Route Handlers, JSON)

| Método | Rota | Descrição |
| :---- | :---- | :---- |
| GET/POST | `/api/empresas` | listar/criar |
| GET/PATCH/DELETE | `/api/empresas/:id` |  |
| GET/POST | `/api/empresas/:id/simulacoes` |  |
| GET/PUT | `/api/simulacoes/:id` | carrega/salva rascunho completo (premissas, dívidas, contingências, eventos, overrides, cenários) — **autosave debounce 2 s** |
| POST | `/api/simulacoes/:id/duplicar` |  |
| POST | `/api/simulacoes/:id/versoes` | congela: roda motor no servidor, grava snapshot \+ resultado \+ engine\_version |
| GET | `/api/versoes/:id` |  |
| POST | `/api/versoes/:id/conclusao` | gera conclusão IA (Seção 9\) |
| GET | `/api/export/:simulacaoId.xlsx` | v1: exporta DRE/BP/DFC/indicadores |

---

## 8\. Modelo de dados (Postgres)

CREATE TABLE usuario (

  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  nome text NOT NULL, email text UNIQUE NOT NULL,

  created\_at timestamptz NOT NULL DEFAULT now()

);

CREATE TABLE empresa (

  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  owner\_id uuid NOT NULL REFERENCES usuario(id),

  razao\_social text NOT NULL, cnpj text, segmento text,

  regime\_tributario text NOT NULL CHECK (regime\_tributario IN ('simples','presumido','real','mei')),

  atividade\_presumido text CHECK (atividade\_presumido IN ('comercio\_industria','servicos')),

  uf char(2), cidade text, ano\_inicio smallint,

  created\_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (owner\_id, cnpj)

);

CREATE TABLE simulacao (

  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  empresa\_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,

  owner\_id uuid NOT NULL REFERENCES usuario(id),

  nome text NOT NULL,

  data\_base date NOT NULL,

  horizonte\_meses smallint NOT NULL DEFAULT 12 CHECK (horizonte\_meses BETWEEN 1 AND 60),

  schema\_version smallint NOT NULL DEFAULT 1,

  config jsonb NOT NULL DEFAULT '{}',

  created\_at timestamptz NOT NULL DEFAULT now(),

  updated\_at timestamptz NOT NULL DEFAULT now()

);

CREATE TABLE premissas (

  simulacao\_id uuid PRIMARY KEY REFERENCES simulacao(id) ON DELETE CASCADE,

  historico\_12m jsonb NOT NULL,   \-- Seção 4.2

  abertura jsonb NOT NULL,        \-- Seção 4.3 (exceto listas)

  projecao jsonb NOT NULL         \-- Seção 4.6 (exceto eventos/overrides)

);

CREATE TABLE driver\_override (

  simulacao\_id uuid REFERENCES simulacao(id) ON DELETE CASCADE,

  driver text NOT NULL,

  mes smallint NOT NULL CHECK (mes \>= 1),

  valor numeric(18,6) NOT NULL,

  PRIMARY KEY (simulacao\_id, driver, mes)

);

CREATE TABLE divida (

  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  simulacao\_id uuid NOT NULL REFERENCES simulacao(id) ON DELETE CASCADE,

  tipo text NOT NULL CHECK (tipo IN ('bancaria','tributaria')),

  descricao text,

  saldo numeric(18,2) NOT NULL CHECK (saldo \> 0),

  taxa numeric(10,6) NOT NULL CHECK (taxa \>= 0),

  unidade\_taxa text NOT NULL CHECK (unidade\_taxa IN ('am','aa')),

  prazo\_meses smallint NOT NULL CHECK (prazo\_meses \> 0),

  sistema text NOT NULL DEFAULT 'price' CHECK (sistema IN ('price','sac','bullet')),

  carencia\_meses smallint NOT NULL DEFAULT 0,

  mes\_inicio smallint NOT NULL DEFAULT 0,

  parcelada boolean NOT NULL DEFAULT true

);

CREATE TABLE contingencia (

  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  simulacao\_id uuid NOT NULL REFERENCES simulacao(id) ON DELETE CASCADE,

  natureza text NOT NULL CHECK (natureza IN ('trabalhista','civel','tributaria')),

  polo text NOT NULL CHECK (polo IN ('ativo','passivo')),

  valor numeric(18,2) NOT NULL,

  probabilidade text NOT NULL CHECK (probabilidade IN ('provavel','possivel','remota')),

  mes\_desfecho smallint

);

CREATE TABLE evento (

  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  simulacao\_id uuid NOT NULL REFERENCES simulacao(id) ON DELETE CASCADE,

  tipo text NOT NULL CHECK (tipo IN ('capex','aporte','contratacao','reajusteFolha','vendaAtivo')),

  mes smallint NOT NULL CHECK (mes \>= 1),

  valor numeric(18,2) NOT NULL,

  parametros jsonb NOT NULL DEFAULT '{}'

);

CREATE TABLE cenario (

  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  simulacao\_id uuid NOT NULL REFERENCES simulacao(id) ON DELETE CASCADE,

  tipo text NOT NULL CHECK (tipo IN ('atual','pessimista','otimista','custom')),

  nome text NOT NULL, descricao text,

  alavancas jsonb NOT NULL,

  ordem smallint NOT NULL DEFAULT 0

);

CREATE UNIQUE INDEX ux\_cenario\_padrao ON cenario(simulacao\_id, tipo) WHERE tipo \<\> 'custom';

CREATE TABLE versao (

  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  simulacao\_id uuid NOT NULL REFERENCES simulacao(id) ON DELETE CASCADE,

  numero integer NOT NULL,

  label text,

  snapshot jsonb NOT NULL,

  engine\_version text NOT NULL,

  resultado jsonb NOT NULL,       \-- Record\<cenarioId, Resultado\>; imutável

  created\_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (simulacao\_id, numero)

);

CREATE TABLE conclusao\_ia (

  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  versao\_id uuid NOT NULL REFERENCES versao(id) ON DELETE CASCADE,

  cenario\_tipo text NOT NULL,

  modelo text NOT NULL,

  prompt\_version text NOT NULL,

  texto text NOT NULL,

  numeros\_validados boolean NOT NULL,

  created\_at timestamptz NOT NULL DEFAULT now()

);

\-- Parâmetros fiscais com vigência (NUNCA hardcode no motor)

CREATE TABLE parametro\_fiscal (

  chave text NOT NULL,            \-- 'irpj\_aliq','irpj\_adicional\_aliq','irpj\_adicional\_limite\_mensal','csll\_aliq',

                                  \-- 'presuncao\_irpj\_comercio','presuncao\_irpj\_servicos','presuncao\_csll\_comercio',

                                  \-- 'presuncao\_csll\_servicos','selic\_am\_default'

  vigencia\_inicio date NOT NULL,

  vigencia\_fim date,

  valor numeric(12,6) NOT NULL,

  fonte text NOT NULL,            \-- norma/URL

  PRIMARY KEY (chave, vigencia\_inicio)

);

Sem tabelas de `plano_de_contas`, `lancamentos` ou `indicadores_calculados` (decisão arquitetural: projeção por premissas; resultado derivado não é persistido fora de `versao`). O motor recebe os parâmetros fiscais já resolvidos por mês (injetados em `EntradaSimulacao.fiscal[t]`), mantendo-se puro.

**LGPD:** dados de terceiros (CNPJ, financeiros, contato). Mínimo: termo de consentimento/contrato de consultoria por empresa cliente; criptografia em repouso (padrão do provedor); backup; função "excluir empresa" que apaga em cascata; logs sem dados financeiros.

---

## 9\. UX / Telas

Design próprio (não reproduzir layout de referência). Desktop-first, responsivo até 390 px (leitura no celular; edição pesada no desktop).

| \# | Tela | Conteúdo | Comportamento |
| :---- | :---- | :---- | :---- |
| T1 | Empresas | Lista, busca, criar/editar | — |
| T2 | Simulações da empresa | Lista com data-base, última versão, caixa final projetado, alerta crítico (badge) | Duplicar, arquivar |
| T3 | Editor — Premissas (wizard em 6 passos) | 1 Receita e canais · 2 Custos variáveis · 3 Estrutura fixa · 4 Balanço de abertura · 5 Dívidas e contingências · 6 Projeção (crescimento, sazonalidade, eventos) | Painel lateral de resultado ao vivo (caixa final, LL, PEC, alertas); validação inline; progresso por passo |
| T4 | Editor — Tabela mensal | Linhas \= drivers (RB, CMV%, folha, fixos, marketing, alíquota vendas…); colunas \= meses 1..H; célula calculada em cinza, override em destaque com botão "reverter" | Edição célula a célula |
| T5 | Cenários | Cards Atual/Pessimista/Otimista/+custom com as 8 alavancas | Prévia ao vivo; "Atual" travado |
| T6 | Resultado — DRE | Mensal (1..12 \+ Total) \+ análise vertical %RB/%RL; seletor de cenário | Linhas colapsáveis; tooltip do registro |
| T7 | Resultado — Balanço | t0..t12; destaque em PLUG0 com explicação | Checagem C1 visível (selo "Balanço fechado") |
| T8 | Resultado — Fluxo de caixa | DFC mensal \+ gráfico de linha do caixa com faixa negativa em vermelho | — |
| T9 | Indicadores | Cards por grupo (Resultado, Equilíbrio, Ciclos, Liquidez, Endividamento, Retorno, Eficiência) com valor anual \+ sparkline mensal \+ semáforo | "—" com motivo no tooltip quando null |
| T10 | Comparar cenários | DRE e indicadores lado a lado \+ gráfico de caixa sobreposto | — |
| T11 | Dívidas | Tabela de amortização por dívida, CP/LP por mês | — |
| T12 | Conclusão | Texto da IA por cenário \+ botão gerar/regenerar | Seção 9.1 |
| T13 | Versões | Histórico, label, comparar versão A × B (diff de indicadores) | Versões são somente leitura |
| T14 | Relatório | Página de impressão (capa, sumário executivo, DRE, BP, DFC, indicadores, cenários, notas de contingência, premissas usadas) | PDF |

### 9.1 Conclusão por IA

- Entrada: `Resultado` do cenário (anual \+ mensal resumido) \+ alertas \+ premissas relevantes. **Não** enviar CNPJ/razão social ao modelo.  
- Prompt (versionado em `prompt_version`): papel de analista financeiro; linguagem simples; estrutura fixa: (1) situação atual em 3 frases, (2) 3–5 pontos de atenção ordenados por impacto em caixa, (3) alavancas com maior sensibilidade (derivadas da comparação de cenários), (4) o que monitorar mês a mês.  
- **Guardrail numérico:** todo número citado deve existir no JSON (tolerância de arredondamento). Pós-processamento extrai números do texto e valida; se falhar, regenerar 1× e, persistindo, marcar `numeros_validados = false` e exibir aviso.  
- Não prescrever decisões jurídicas/tributárias; incluir linha "valide decisões tributárias com seu contador".

---

## 10\. Roadmap

### MVP — "o motor fecha" (≈ 3–4 semanas de dev)

Escopo:

- `packages/engine` completo para: receita/canais, descontos, impostos (alíquota calibrada), CMV/estoque/compras/fornecedores, despesas, depreciação, dívidas Price/SAC/bullet/carência, receita financeira, cheque especial, **IR modo informado**, DRE, DFC, BP, checagens C1–C9, indicadores da Seção 6.10, alertas.  
- Cenários: Atual/Pessimista/Otimista.  
- UI: T1, T2, T3, T5, T6, T7, T8, T9, T10. Sem auth, local.  
- Postgres local (Docker) \+ Drizzle \+ autosave.  
- Relatório via CSS de impressão (T14 simplificado).

**Pronto quando:**

1. 100% das fórmulas da Seção 6 com teste unitário; cobertura engine ≥ 95%.  
2. Property tests (fast-check, 10.000 casos aleatórios válidos): C1–C9 sempre verdadeiros.  
3. Exemplo 6.11 e Price 6.4 passam exatos (2 casas).  
4. **5 golden cases** (Seção 11.2) validados e assinados por contador.  
5. Prévia ao vivo \< 100 ms percebidos com H \= 12\.

### v1 — "uso profissional" (≈ 3–4 semanas)

- IR por regime (6.6) com `parametro_fiscal` e vigências; compensação de prejuízo (30%).  
- Eventos (capex, aporte, contratação, reajuste, venda de ativo); tabela mensal T4 com overrides; sazonalidade.  
- T11 dívidas, T12 conclusão IA, T13 versões \+ diff.  
- Cenários custom ilimitados.  
- Import de template CSV/XLSX para histórico e abertura (substitui o "colar" dispensado).  
- Export XLSX dos demonstrativos.  
- PDF servidor (@react-pdf/renderer).  
- Deploy nuvem: Supabase (Postgres \+ Auth) \+ Vercel; migração dos dados locais via `pg_dump`/`pg_restore`.

**Pronto quando:** golden cases passam por regime (Simples, Presumido, Real); round-trip de import→export idêntico; versão congelada reproduz resultado após bump de `ENGINE_VERSION` (teste de regressão compara JSON salvo); deploy com auth e RLS ativos.

### v2 — "inteligência"

- Horizonte até 60 meses; indicadores trimestrais/anuais.  
- Análise de sensibilidade (tornado chart: impacto de ±10% em cada driver no caixa final e LL).  
- Meta reversa ("qual RB zera o caixa negativo?") via busca por bisseção sobre o motor.  
- Orçado × realizado (lançar realizado mensal e comparar) — exige nova entidade `realizado_mensal`.  
- Benchmark entre empresas da carteira.  
- Multiusuário (RLS por `owner_id` já preparado).

### Riscos e mitigação

| Risco | Prob. | Impacto | Mitigação |
| :---- | :---- | :---- | :---- |
| Fórmula contábil errada passa despercebida | Média | Alto | Golden cases assinados por contador (CRC) \+ invariantes C1–C9 em property tests |
| Mudança tributária (reforma CBS/IBS 2026–2033) invalida alíquotas | Alta | Médio | Alíquota por mês editável; `parametro_fiscal` com vigência; alerta `A_aliquotaReforma` |
| Usuário informa dados inconsistentes (mix ≠ 100, IR no Simples) | Alta | Médio | Validação bloqueante \+ alertas |
| Ciclo de dependência introduzido em manutenção | Média | Alto | Regra 6.1 no tipo \+ teste que injeta dependência proibida e falha compilação |
| IA inventa números | Média | Alto | Guardrail 9.1 |
| Escopo cresce para "ERP" | Alta | Alto | Seção 1 "fora de escopo"; qualquer item novo entra no roadmap, não no MVP |
| Semelhança excessiva com produto de referência | Baixa (se seguir Seção 12\) | Alto | Checklist Seção 12 revisado antes de cada release |

---

## 11\. Estratégia de testes

### 11.1 Pirâmide

| Nível | Ferramenta | O quê |
| :---- | :---- | :---- |
| Unit | Vitest | Cada fórmula; bordas (0, negativo, n=1, i=0, PL\<0, RB=0) |
| Property | fast-check | Geradores de `EntradaSimulacao` válidas → C1–C9 sempre; monotonicidade (↑RB com demais fixos ⇒ ↑MC; ↑dPrazoReceb ⇒ ↓Caixa\_12 ou igual) |
| Golden | Vitest \+ JSON | Entradas fixas → saída esperada **congelada**, construída fora do código |
| Regressão de versão | Vitest | `versao.resultado` salvo \== `calcular(snapshot)` com a mesma `engine_version` |
| E2E | Playwright | Criar empresa → preencher → ver balanço fechado → criar versão → gerar relatório |

### 11.2 Golden cases (obrigatórios antes do release do MVP)

Construídos **em planilha independente por contador com CRC**, não pelo código:

| \# | Perfil | Objetivo |
| :---- | :---- | :---- |
| G1 | Comércio varejista, Simples, estoque relevante, cartão 60% | Ciclos, antecipação, taxas de cartão |
| G2 | Serviços, Lucro Presumido (32%), sem estoque | IR presumido, PEC sem CMV |
| G3 | Indústria, Lucro Real, 3 dívidas (Price, SAC, carência) | Dívidas, CP/LP, IR real com prejuízo em alguns meses |
| G4 | Empresa com caixa negativo a partir do mês 4 | Cheque especial t−1, alertas |
| G5 | PL negativo na abertura \+ tributária não parcelada \+ contingência provável | PLUG0, provisões, indicadores null |

Formato: `test/golden/G1.input.json` \+ `G1.expected.json` (todas as linhas DRE/BP/DFC mensais \+ indicadores anuais), tolerância 0,01.

### 11.3 Teste de equivalência contra planilha

Script `pnpm golden:compare G1` imprime diff linha a linha (esperado × obtido × delta) — ferramenta de depuração principal.

---

## 12\. Checklist ético e legal (produto comercial)

> Não é aconselhamento jurídico. Validar com advogado de propriedade intelectual antes do lançamento comercial.

**NÃO copiar do produto de referência:**

- [ ] Código-fonte (HTML/CSS/JS/bundles), mesmo minificado ou "adaptado" (Lei 9.609/98 — software).  
- [ ] Layout, disposição de painéis, paleta, ícones, tipografia combinada — conjunto-imagem (*trade dress*).  
- [ ] Textos autorais: perguntas com a mesma redação, glossário, microcopy, textos de ajuda (Lei 9.610/98).  
- [ ] Nome, marca, logotipo, domínio parecido, expressões publicitárias.  
- [ ] Sequência/estrutura idêntica dos blocos de perguntas como elemento distintivo.  
- [ ] Qualquer dado de usuários do produto de referência.  
- [ ] Práticas que induzam confusão com o concorrente (Lei 9.279/96, art. 195 — concorrência desleal).

**LIVRE para implementar:**

- [x] Fórmulas e conceitos contábeis/financeiros (DRE, BP, DFC, Fleuriet, PEC/PEF, índices) — domínio público/normas CPC.  
- [x] A ideia de simulador com cenários e prévia ao vivo (ideias não são protegidas por direito autoral).  
- [x] Estrutura funcional genérica (formulário → cálculo → relatório).  
- [x] Esta especificação (autoria própria), que diverge deliberadamente em regras contábeis (Seção 14).

**Obrigações próprias:**

- [ ] LGPD: base legal (contrato de consultoria), política de privacidade, exclusão, segurança (Seção 8).  
- [ ] Termo de uso com isenção: "projeção gerencial, não substitui demonstrações contábeis oficiais nem aconselhamento tributário".  
- [ ] Licenças de dependências: apenas MIT/Apache/BSD/ISC; CI com `license-checker` bloqueando GPL/AGPL/comerciais.  
- [ ] Registro de marca própria no INPI antes de divulgar.

---

## 13\. Pontos em aberto / premissas a validar

| \# | Item | Default adotado | Quem decide |
| :---- | :---- | :---- | :---- |
| P1 | Parâmetros de IR/CSLL e presunção vigentes (inclui eventuais mudanças legais recentes) | Tabela 6.6 | Contador |
| P2 | Reforma tributária do consumo (CBS/IBS substituindo PIS/Cofins/ICMS/ISS gradualmente a partir de 2026–2027) — impacto na alíquota efetiva projetada | Alíquota por mês editável \+ alerta | Contador \+ dono |
| P3 | Marketing como fixo ou % da receita | Fixo (`valor`) | Dono |
| P4 | Juros pagos no FCO ou FCF | FCO | Dono (CPC 03 permite ambos) |
| P5 | Aplicações reinvestem rendimento | Sim | Dono |
| P6 | Imobilizado a valor de mercado (gerencial) × custo | Valor informado (gerencial) | Dono |
| P7 | Base de dias 360 × 365 | 360 | Dono |
| P8 | Valores default dos cenários pessimista/otimista | Seção 4.8 | Dono |

---

## 14\. Anexo — Onde esta spec diverge intencionalmente do simulador de referência

Baseado apenas na observação da interface pública (estrutura de DRE/BP e textos de glossário), sem acesso ao código.

| Tema | Referência (aparente) | Esta spec | Motivo |
| :---- | :---- | :---- | :---- |
| Comissão | Deduzida antes da "venda líquida" | Despesa variável após RL | CPC 47: RL \= RB − deduções de receita |
| Taxa de cartão, frete, antecipação | Sem linha própria | Linhas explícitas | Visibilidade do custo de vender |
| Ações a receber | Reconhecidas no ativo | Não reconhecidas (nota) | CPC 25 |
| Contingências passivas | Valor integral no passivo | Só `provavel` | CPC 25 |
| Inadimplência nos cenários | Sem taxa base | Taxa base \+ variação em p.p. | Alavanca sem base não produz efeito |
| Divisão por zero | Exibe 0% | `null` → "—" | 0% é informação falsa |
| Período | Retrato anual único | Projeção mensal integrada, BP fecha todo mês | D2 |
| Dívida | Saldo único | N dívidas com Price/SAC, CP/LP calculado | CPC 26 |
| Distribuição a sócios | Na DRE | **Mantida na DRE (D3)**, com subtotal "Lucro antes da distribuição" usado nos indicadores | Comparabilidade entre empresas |
| Pró-labore × distribuição | Campo único "retirada" | Campos separados | Pró-labore é despesa; distribuição é PL |

---

*Fim da especificação. Qualquer alteração: editar este arquivo, registrar em `docs/CHANGELOG-SPEC.md`, atualizar testes afetados.*