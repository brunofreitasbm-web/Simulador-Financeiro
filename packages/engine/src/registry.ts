import type { BPKey, DFCKey, DREKey, IndicadorId } from './types'

export type Unidade = 'BRL' | 'pct' | 'dias' | 'meses' | 'x'
export interface MetaCampo {
  id: string
  rotulo: string
  formulaLegivel: string
  dependeDe: string[]
  tipo: 'R' | 'P'
  unidade: Unidade
  nullQuando?: string
  glossario: string
}

const m = (id: string, rotulo: string, formulaLegivel: string, dependeDe: string[], tipo: 'R' | 'P', unidade: Unidade, glossario: string, nullQuando?: string): MetaCampo =>
  ({ id, rotulo, formulaLegivel, dependeDe, tipo, unidade, glossario, ...(nullQuando ? { nullQuando } : {}) })

const dre: Record<DREKey, MetaCampo> = {
  rb: m('rb', 'Receita bruta', 'Base mensal × crescimento × sazonalidade × cenário', ['rb12'], 'R', 'BRL', 'Faturamento antes de descontos e impostos.'),
  descontos: m('descontos', '(−) Descontos concedidos', 'Vendas à vista × desconto médio', ['rb', 'descVista'], 'R', 'BRL', 'Descontos dados a quem paga à vista.'),
  impostos: m('impostos', '(−) Impostos sobre vendas', '(RB − descontos) × alíquota efetiva', ['rb', 'descontos'], 'R', 'BRL', 'Tributos incidentes sobre a venda (DAS no Simples).'),
  rl: m('rl', '= Receita líquida', 'RB − descontos − impostos', ['rb', 'descontos', 'impostos'], 'R', 'BRL', 'Receita após deduções (CPC 47).'),
  cmv: m('cmv', '(−) CMV', 'RB × CMV%', ['rb'], 'R', 'BRL', 'Custo das mercadorias vendidas.'),
  comissoes: m('comissoes', '(−) Comissões', '(RB − descontos) × comissão%', ['rb', 'descontos'], 'R', 'BRL', 'Despesa variável de venda.'),
  taxaCartao: m('taxaCartao', '(−) Taxas de cartão', 'Vendas no cartão × taxa', ['rb'], 'R', 'BRL', 'Custo da operadora de cartão (MDR).'),
  frete: m('frete', '(−) Frete/logística', 'RB × frete%', ['rb'], 'P', 'BRL', 'Custo de entrega proporcional à receita.'),
  perdas: m('perdas', '(−) Perdas com inadimplência', 'Vendas a prazo não antecipadas × inadimplência', ['rb'], 'R', 'BRL', 'Constituição da PDD.'),
  mc: m('mc', '= Margem de contribuição', 'RL − CMV − variáveis', ['rl', 'cmv', 'comissoes', 'taxaCartao', 'frete', 'perdas'], 'R', 'BRL', 'O que sobra da venda para pagar a estrutura fixa.'),
  pessoal: m('pessoal', '(−) Pessoal', 'Folha + temporários + pró-labore (+ eventos)', [], 'R', 'BRL', 'Custo com pessoas, com encargos.'),
  gastosFixos: m('gastosFixos', '(−) Gastos fixos gerais', 'Fixos/12 × inflação × cenário', [], 'R', 'BRL', 'Aluguel, energia, sistemas etc.'),
  marketing: m('marketing', '(−) Marketing', 'Valor fixo ou % da receita', [], 'P', 'BRL', 'Mídia e divulgação.'),
  dasMei: m('dasMei', '(−) DAS MEI', 'Valor fixo mensal (só MEI)', [], 'R', 'BRL', 'Guia mensal do MEI.'),
  ebitda: m('ebitda', '= EBITDA', 'MC − pessoal − fixos − marketing − DAS MEI', ['mc', 'pessoal', 'gastosFixos', 'marketing', 'dasMei'], 'R', 'BRL', 'Resultado operacional antes de depreciação e financeiro.'),
  depreciacao: m('depreciacao', '(−) Depreciação e amortização', 'Linear pela vida útil', [], 'R', 'BRL', 'Desgaste de imobilizado e intangível.'),
  ebit: m('ebit', '= EBIT', 'EBITDA − D&A', ['ebitda', 'depreciacao'], 'R', 'BRL', 'Resultado operacional.'),
  despFinDividas: m('despFinDividas', 'Juros de dívidas', 'Saldo(t−1) × taxa', [], 'R', 'BRL', 'Juros de empréstimos e parcelamentos.'),
  despFinCheque: m('despFinCheque', 'Juros de cheque especial', 'max(0, −caixa(t−1)) × taxa', [], 'R', 'BRL', 'Custo de caixa negativo.'),
  despFinAntecipacao: m('despFinAntecipacao', 'Custo de antecipação', 'Recebíveis antecipados × taxa × prazo', [], 'R', 'BRL', 'Desconto pago para receber antes.'),
  despFinanceiras: m('despFinanceiras', '(−) Despesas financeiras', 'Juros + cheque + antecipação', ['despFinDividas', 'despFinCheque', 'despFinAntecipacao'], 'R', 'BRL', 'Total de despesas financeiras.'),
  recFinanceiras: m('recFinanceiras', '(+) Receitas financeiras', 'Aplicações(t−1) × rendimento', [], 'R', 'BRL', 'Rendimento das aplicações.'),
  lair: m('lair', '= LAIR', 'EBIT − despesas fin. + receitas fin.', ['ebit', 'despFinanceiras', 'recFinanceiras'], 'R', 'BRL', 'Lucro antes do IR/CSLL.'),
  irCsll: m('irCsll', '(−) IR/CSLL', 'IR/CSLL 12m ÷ 12 (modo informado)', [], 'R', 'BRL', 'Imposto sobre o lucro (fora do DAS).'),
  ll: m('ll', '= Lucro antes da distribuição', 'LAIR − IR/CSLL', ['lair', 'irCsll'], 'R', 'BRL', 'Lucro líquido do período.'),
  distribuicao: m('distribuicao', '(−) Distribuição aos sócios', 'Distribuição 12m ÷ 12 × cenário', [], 'P', 'BRL', 'Movimento de PL, exibido na DRE por escolha do produto.'),
  resultadoApos: m('resultadoApos', '= Resultado após distribuição', 'LL − distribuição', ['ll', 'distribuicao'], 'P', 'BRL', 'O que fica na empresa.'),
}

const bp: Record<BPKey, MetaCampo> = {
  caixa: m('caixa', 'Caixa', 'Caixa(t−1) + variação do DFC', ['deltaCaixa'], 'R', 'BRL', 'Saldo em contas correntes.'),
  aplicacoes: m('aplicacoes', 'Aplicações financeiras', 'Aplic(t−1) + rendimento', [], 'P', 'BRL', 'Rendimento reinvestido.'),
  contasReceber: m('contasReceber', 'Contas a receber', 'Fila de recebíveis a prazo e cartão', [], 'R', 'BRL', 'Vendas ainda não recebidas.'),
  pdd: m('pdd', '(−) PDD', 'Perdas constituídas − baixas', [], 'R', 'BRL', 'Provisão para devedores duvidosos.'),
  estoque: m('estoque', 'Estoque', 'CMV × dias de estoque ÷ 30', [], 'R', 'BRL', 'Mercadorias a custo.'),
  ac: m('ac', 'Ativo circulante', 'Caixa + aplicações + CR − PDD + estoque', [], 'R', 'BRL', 'Ativos realizáveis em até 12 meses.'),
  imobilizado: m('imobilizado', 'Imobilizado líquido', 'Anterior + capex − depreciação', [], 'R', 'BRL', 'Máquinas, móveis e imóveis.'),
  intangivel: m('intangivel', 'Intangível líquido', 'Anterior − amortização', [], 'R', 'BRL', 'Software, marcas, fundo de comércio.'),
  anc: m('anc', 'Ativo não circulante', 'Imobilizado + intangível', [], 'R', 'BRL', 'Ativos de longo prazo.'),
  ativo: m('ativo', 'Ativo total', 'AC + ANC', [], 'R', 'BRL', 'Total do ativo.'),
  fornecedores: m('fornecedores', 'Fornecedores', 'Compras ainda não pagas', [], 'R', 'BRL', 'Compras a pagar.'),
  contasAPagar: m('contasAPagar', 'Contas a pagar', 'Impostos, comissões, folha e IR do mês', [], 'R', 'BRL', 'Despesas de competência pagas no mês seguinte.'),
  emprestimosCP: m('emprestimosCP', 'Empréstimos (CP)', 'Amortizações dos próximos 12 meses', [], 'R', 'BRL', 'Parcela circulante (CPC 26).'),
  parcelamentosCP: m('parcelamentosCP', 'Parcelamentos tributários (CP)', 'Amortizações dos próximos 12 meses', [], 'R', 'BRL', 'Parcela circulante.'),
  provisoesCP: m('provisoesCP', 'Provisões (CP)', 'Contingências prováveis com desfecho em 12 meses', [], 'R', 'BRL', 'Provisão CPC 25.'),
  pc: m('pc', 'Passivo circulante', 'Fornecedores + a pagar + CP', [], 'R', 'BRL', 'Obrigações de até 12 meses.'),
  emprestimosLP: m('emprestimosLP', 'Empréstimos (LP)', 'Saldo − CP', [], 'R', 'BRL', 'Parcela não circulante.'),
  parcelamentosLP: m('parcelamentosLP', 'Parcelamentos tributários (LP)', 'Saldo − CP', [], 'R', 'BRL', 'Parcela não circulante.'),
  provisoesLP: m('provisoesLP', 'Provisões (LP)', 'Contingências prováveis sem desfecho em 12 meses', [], 'R', 'BRL', 'Provisão CPC 25.'),
  pnc: m('pnc', 'Passivo não circulante', 'Empréstimos + parcelamentos + provisões LP', [], 'R', 'BRL', 'Obrigações de longo prazo.'),
  capitalSocial: m('capitalSocial', 'Capital social', 'Capital + aportes', [], 'R', 'BRL', 'Integralizado pelos sócios.'),
  lucrosAcumulados: m('lucrosAcumulados', 'Resultados acumulados (estimado pelo balanço de abertura)', 'LA(t−1) + LL − distribuição', [], 'R', 'BRL', 'No mês 0 é o único fechamento do modelo: Ativo − Passivo − Capital.'),
  pl: m('pl', 'Patrimônio líquido', 'Capital + resultados acumulados', [], 'R', 'BRL', 'Patrimônio dos sócios.'),
  passivoPL: m('passivoPL', 'Passivo + PL', 'PC + PNC + PL', [], 'R', 'BRL', 'Deve ser igual ao ativo.'),
}

const dfc: Record<DFCKey, MetaCampo> = {
  ll: m('ll', 'Lucro antes da distribuição', 'DRE', [], 'R', 'BRL', 'Ponto de partida do método indireto.'),
  depreciacao: m('depreciacao', '(+) Depreciação e amortização', 'DRE', [], 'R', 'BRL', 'Não afeta o caixa.'),
  varPdd: m('varPdd', '(+) Variação da PDD', 'PDD(t) − PDD(t−1)', [], 'R', 'BRL', 'Perda constituída não é saída de caixa.'),
  jurosCapitalizados: m('jurosCapitalizados', '(+) Juros capitalizados', 'Juros de parcelamento não pago', [], 'P', 'BRL', 'Selic acumulada sobre tributária não parcelada.'),
  varContasReceber: m('varContasReceber', '(−) Variação de contas a receber', '−ΔCR', [], 'R', 'BRL', 'Aumento de CR consome caixa.'),
  varEstoque: m('varEstoque', '(−) Variação de estoque', '−ΔEstoque', [], 'R', 'BRL', 'Aumento de estoque consome caixa.'),
  varFornecedores: m('varFornecedores', '(+) Variação de fornecedores', 'ΔFornecedores', [], 'R', 'BRL', 'Prazo de fornecedores financia o giro.'),
  varContasAPagar: m('varContasAPagar', '(+) Variação de contas a pagar', 'ΔContas a pagar', [], 'R', 'BRL', 'Despesas ainda não pagas.'),
  varProvisoes: m('varProvisoes', '(+) Variação de provisões', 'ΔProvisões', [], 'R', 'BRL', 'Constituição/baixa de provisões.'),
  fco: m('fco', '= Caixa operacional (FCO)', 'Soma das linhas acima', [], 'R', 'BRL', 'Juros pagos ficam aqui (CPC 03).'),
  capex: m('capex', '(−) Investimentos (capex)', 'Eventos de capex', [], 'R', 'BRL', 'Compra de imobilizado.'),
  varAplicacoes: m('varAplicacoes', '(−) Variação de aplicações', '−ΔAplicações', [], 'P', 'BRL', 'Reinvestimento do rendimento.'),
  fci: m('fci', '= Caixa de investimento (FCI)', 'Capex + variação de aplicações', [], 'R', 'BRL', 'Fluxo de investimentos.'),
  captacoes: m('captacoes', '(+) Captações', 'Dívidas planejadas', [], 'R', 'BRL', 'Entrada de empréstimos.'),
  amortizacoes: m('amortizacoes', '(−) Amortizações', 'Principal pago', [], 'R', 'BRL', 'Saída de principal.'),
  aportes: m('aportes', '(+) Aportes de capital', 'Eventos de aporte', [], 'R', 'BRL', 'Capital novo dos sócios.'),
  distribuicao: m('distribuicao', '(−) Distribuição aos sócios', 'DRE', [], 'P', 'BRL', 'Saída de caixa para os sócios.'),
  fcf: m('fcf', '= Caixa de financiamento (FCF)', 'Captações − amortizações + aportes − distribuição', [], 'R', 'BRL', 'Fluxo de financiamento.'),
  deltaCaixa: m('deltaCaixa', '= Variação do caixa', 'FCO + FCI + FCF', [], 'R', 'BRL', 'Alimenta o caixa do balanço.'),
}

const ind = (id: IndicadorId, rotulo: string, f: string, tipo: 'R' | 'P', unidade: Unidade, g: string, nq?: string) => m(id, rotulo, f, [], tipo, unidade, g, nq)
const indicadores: Record<IndicadorId, MetaCampo> = {
  rbMensal: ind('rbMensal', 'Faturamento mensal médio', 'ΣRB ÷ meses', 'R', 'BRL', 'Média mensal da receita bruta.'),
  gvPct: ind('gvPct', 'Gasto variável total', '(impostos + CMV + variáveis) ÷ RB', 'P', 'pct', 'Quanto de cada R$ vendido vira custo variável.', 'RB = 0'),
  mcPct: ind('mcPct', 'Margem de contribuição', 'MC ÷ RL', 'R', 'pct', 'Fatia da receita líquida que cobre a estrutura fixa.', 'RL ≤ 0'),
  ebitdaPct: ind('ebitdaPct', 'Margem EBITDA', 'EBITDA ÷ RL', 'R', 'pct', 'Geração operacional de caixa sobre a receita.', 'RL ≤ 0'),
  ebitPct: ind('ebitPct', 'Margem operacional', 'EBIT ÷ RL', 'R', 'pct', 'Resultado operacional sobre a receita.', 'RL ≤ 0'),
  mlPct: ind('mlPct', 'Margem líquida', 'Lucro ÷ RL', 'R', 'pct', 'Lucro final sobre a receita líquida.', 'RL ≤ 0'),
  pec: ind('pec', 'Ponto de equilíbrio contábil', '(GF + D&A) ÷ MC%', 'R', 'BRL', 'RL mensal em que o lucro operacional é zero.', 'MC% ≤ 0'),
  pecRB: ind('pecRB', 'Equilíbrio contábil em faturamento', 'PEC ÷ (RL/RB)', 'P', 'BRL', 'Mesmo ponto, em receita bruta.', 'MC% ≤ 0'),
  pef: ind('pef', 'Ponto de equilíbrio financeiro', '(GF + juros + amortizações − D&A) ÷ MC%', 'R', 'BRL', 'RL mensal para pagar todas as contas.', 'MC% ≤ 0'),
  mso: ind('mso', 'Margem de segurança', '(RL − PEC) ÷ RL', 'R', 'pct', 'Quanto a receita pode cair antes do prejuízo.', 'RL ≤ 0'),
  gao: ind('gao', 'Alavancagem operacional', 'MC ÷ EBIT', 'R', 'x', 'Sensibilidade do lucro à variação de receita.', 'EBIT ≤ 0'),
  pmre: ind('pmre', 'Prazo médio de estoque', 'Estoque ÷ CMV × dias', 'R', 'dias', 'Dias que o estoque leva para girar.', 'CMV = 0'),
  pmrv: ind('pmrv', 'Prazo médio de recebimento', 'CR ÷ RB × dias', 'R', 'dias', 'Dias para receber as vendas (sobre RB total).', 'RB = 0'),
  pmpc: ind('pmpc', 'Prazo médio de pagamento', 'Fornecedores ÷ compras × dias', 'R', 'dias', 'Dias para pagar fornecedores.', 'Compras = 0'),
  co: ind('co', 'Ciclo operacional', 'PMRE + PMRV', 'R', 'dias', 'Da compra ao recebimento.', 'algum prazo indisponível'),
  cf: ind('cf', 'Ciclo financeiro', 'CO − PMPC', 'R', 'dias', 'Dias que o caixa fica financiando o giro.', 'algum prazo indisponível'),
  ncg: ind('ncg', 'Necessidade de capital de giro', '(CR − PDD + estoque) − (fornecedores + a pagar)', 'R', 'BRL', 'Recursos que o negócio precisa manter no giro.'),
  ncgDias: ind('ncgDias', 'NCG em dias de venda', 'NCG ÷ (RB/dias)', 'R', 'dias', 'NCG medida em dias de faturamento.', 'RB = 0'),
  cdg: ind('cdg', 'Capital de giro', '(PL + PNC) − ANC', 'R', 'BRL', 'Fontes de longo prazo que financiam o giro.'),
  tesouraria: ind('tesouraria', 'Saldo de tesouraria', 'CDG − NCG', 'R', 'BRL', 'Folga (ou aperto) financeiro de curto prazo.'),
  lc: ind('lc', 'Liquidez corrente', 'AC ÷ PC', 'R', 'x', 'Capacidade de pagar o curto prazo.', 'PC = 0'),
  ls: ind('ls', 'Liquidez seca', '(AC − estoque) ÷ PC', 'R', 'x', 'Liquidez sem depender do estoque.', 'PC = 0'),
  li: ind('li', 'Liquidez imediata', '(caixa + aplicações) ÷ PC', 'R', 'x', 'Cobertura do curto prazo só com disponibilidades.', 'PC = 0'),
  lg: ind('lg', 'Liquidez geral', 'AC ÷ (PC + PNC)', 'R', 'x', 'Cobertura de todas as dívidas pelo ativo circulante.', 'passivo exigível = 0'),
  runway: ind('runway', 'Autonomia de caixa', '(caixa + aplic.) ÷ queima média 3m', 'P', 'meses', 'Meses até o caixa acabar no ritmo atual.', 'sem queima → "não queima caixa"'),
  dlEbitda: ind('dlEbitda', 'Dívida líquida / EBITDA', '(dívidas − caixa − aplic.) ÷ EBITDA anual', 'P', 'x', 'Anos de EBITDA para quitar a dívida líquida.', 'EBITDA ≤ 0'),
  icj: ind('icj', 'Cobertura de juros (EBIT)', 'EBIT ÷ despesas financeiras', 'R', 'x', 'Quantas vezes o resultado cobre os juros.', 'sem despesa financeira'),
  icjEbitda: ind('icjEbitda', 'Cobertura de juros (EBITDA)', 'EBITDA ÷ despesas financeiras', 'R', 'x', 'Idem, usando EBITDA.', 'sem despesa financeira'),
  endiv: ind('endiv', 'Endividamento geral', '(PC + PNC) ÷ ativo', 'R', 'pct', 'Fatia do ativo financiada por terceiros.', 'ativo = 0'),
  ipl: ind('ipl', 'Imobilização do PL', '(imob. + intang.) ÷ PL', 'R', 'pct', 'Quanto do PL está preso em ativo fixo.', 'PL ≤ 0'),
  roe: ind('roe', 'ROE', 'Lucro anualizado ÷ PL médio', 'R', 'pct', 'Retorno sobre o patrimônio.', 'PL médio ≤ 0'),
  roa: ind('roa', 'ROA', 'EBIT×(1−t) anualizado ÷ ativo médio', 'R', 'pct', 'Retorno sobre o ativo.', 'ativo = 0'),
  roic: ind('roic', 'ROIC', 'EBIT×(1−t) anualizado ÷ (NCG + imob. + intang.)', 'P', 'pct', 'Retorno sobre o capital investido.', 'capital investido ≤ 0'),
  spread: ind('spread', 'Spread', 'ROIC − custo da dívida×(1−t)', 'P', 'pct', 'Se positivo, a dívida gera valor.', 'sem dívida'),
  gfRl: ind('gfRl', 'Gastos fixos / RL', 'GF ÷ RL', 'R', 'pct', 'Peso da estrutura fixa sobre a receita.', 'RL ≤ 0'),
  custoVender: ind('custoVender', 'Custo de vender', '(comissão + cartão + antecipação + frete + marketing) ÷ RB', 'P', 'pct', 'Quanto custa colocar a venda na rua.', 'RB = 0'),
  giroEstoque: ind('giroEstoque', 'Giro do estoque', 'CMV anualizado ÷ estoque médio', 'R', 'x', 'Vezes por ano que o estoque renova.', 'estoque médio = 0'),
}

export const REGISTRY = { dre, bp, dfc, indicadores }
