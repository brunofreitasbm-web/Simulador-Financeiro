import type { Contingencia } from './schema'

export const DRE_KEYS = [
  'rb', 'descontos', 'impostos', 'rl', 'cmv', 'comissoes', 'taxaCartao', 'frete', 'perdas', 'mc',
  'pessoal', 'gastosFixos', 'marketing', 'dasMei', 'ebitda', 'depreciacao', 'ebit',
  'despFinDividas', 'despFinCheque', 'despFinAntecipacao', 'despFinanceiras', 'recFinanceiras',
  'lair', 'irCsll', 'll', 'distribuicao', 'resultadoApos',
] as const
export type DREKey = (typeof DRE_KEYS)[number]
export type DRE = Record<DREKey, number>

export const BP_KEYS = [
  'caixa', 'aplicacoes', 'contasReceber', 'pdd', 'estoque', 'ac', 'imobilizado', 'intangivel', 'anc', 'ativo',
  'fornecedores', 'contasAPagar', 'emprestimosCP', 'parcelamentosCP', 'provisoesCP', 'pc',
  'emprestimosLP', 'parcelamentosLP', 'provisoesLP', 'pnc',
  'capitalSocial', 'lucrosAcumulados', 'pl', 'passivoPL',
] as const
export type BPKey = (typeof BP_KEYS)[number]
export type BP = Record<BPKey, number>

export const DFC_KEYS = [
  'll', 'depreciacao', 'varPdd', 'jurosCapitalizados', 'varContasReceber', 'varEstoque', 'varFornecedores',
  'varContasAPagar', 'varProvisoes', 'fco',
  'capex', 'varAplicacoes', 'fci',
  'captacoes', 'amortizacoes', 'aportes', 'distribuicao', 'fcf', 'deltaCaixa',
] as const
export type DFCKey = (typeof DFC_KEYS)[number]
export type DFC = Record<DFCKey, number>

export const AUX_KEYS = ['compras', 'estoqueFinal', 'gastosFixosTotal', 'jurosDividasPagos', 'caixaDireto'] as const
export type Aux = Record<(typeof AUX_KEYS)[number], number>

export interface LinhaDivida {
  id: string
  tipo: 'bancaria' | 'tributaria'
  descricao?: string
  saldoInicial: number
  captacao: number
  juros: number
  jurosCapitalizados: number
  amortizacao: number
  saldoFinal: number
  cp: number
  lp: number
}

export interface Mes {
  t: number
  competencia: string
  dre: DRE
  bp: BP
  dfc: DFC
  aux: Aux
  dividas: LinhaDivida[]
}

export const IND_IDS = [
  'rbMensal', 'gvPct', 'mcPct', 'ebitdaPct', 'ebitPct', 'mlPct', 'pec', 'pecRB', 'pef', 'mso', 'gao',
  'pmre', 'pmrv', 'pmpc', 'co', 'cf', 'ncg', 'ncgDias', 'cdg', 'tesouraria',
  'lc', 'ls', 'li', 'lg', 'runway', 'dlEbitda', 'icj', 'icjEbitda', 'endiv', 'ipl',
  'roe', 'roa', 'roic', 'spread', 'gfRl', 'custoVender', 'giroEstoque',
] as const
export type IndicadorId = (typeof IND_IDS)[number]
export type IndicadorValor = number | null | 'nao_queima'
export type Indicadores = Record<IndicadorId, IndicadorValor>

export interface ChecagemResultado { id: string; mes: number; ok: boolean; delta: number }
export interface AlertaResultado { id: string; mes?: number; nivel: 'info' | 'atencao' | 'critico'; mensagem: string }

export interface Resultado {
  engineVersion: string
  meses: Mes[]
  anual: { dre: DRE; dfc: DFC }
  indicadores: { porMes: Indicadores[]; anual: Indicadores }
  checagens: ChecagemResultado[]
  alertas: AlertaResultado[]
  notas: { ativosContingentes: Contingencia[]; passivosPossiveis: Contingencia[] }
}
