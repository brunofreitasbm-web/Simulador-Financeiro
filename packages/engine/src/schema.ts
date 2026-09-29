import { z } from 'zod'

const pos = (max = Infinity) => z.number().min(0).max(max)
const pct = () => z.number().min(0).max(100)

export const RegimeSchema = z.enum(['simples', 'presumido', 'real', 'mei'])

export const EmpresaSchema = z.object({
  regime: RegimeSchema,
  atividadePresumido: z.enum(['comercio_industria', 'servicos']).optional(),
})

/** Seção 4.2 — todos os percentuais em unidade de % (40 = 40%). */
export const HistoricoSchema = z.object({
  rb12: z.number().gt(0),
  pctVista: pct(),
  pctPrazo: pct(),
  pctCartao: pct(),
  descVista: pct().max(50).default(0),
  prazoRecebDias: pos(360),
  prazoCartaoDias: pos(360).default(30),
  taxaCartao: pos(15).default(0),
  pctAntecipado: pct().default(0),
  taxaAntecipacao: pos(10).default(0),
  pctInadimplencia: pos(50).default(0),
  pctComissao: pos(30),
  compras12: pos(),
  prazoPagFornecDias: pos(360),
  frete12: pos().default(0),
  impVendas12: pos().default(0),
  irCsll12: pos().default(0),
  folha12: pos(),
  temporarios12: pos().default(0),
  proLabore12: pos().default(0),
  fixos12: pos(),
  marketing12: pos().default(0),
  distribuicao12: pos().default(0),
  dasMei_m: pos().default(0),
})

const TaxaUnidade = z.enum(['am', 'aa'])

export const DividaSchema = z.object({
  id: z.string().optional(),
  tipo: z.enum(['bancaria', 'tributaria']),
  descricao: z.string().optional(),
  saldo: z.number().gt(0),
  taxa: pos(),
  unidadeTaxa: TaxaUnidade,
  prazoMeses: z.number().int().gt(0),
  sistema: z.enum(['price', 'sac', 'bullet']).default('price'),
  carenciaMeses: z.number().int().min(0).default(0),
  mesInicio: z.number().int().min(0).default(0),
  parcelada: z.boolean().default(true),
})

export const ContingenciaSchema = z.object({
  natureza: z.enum(['trabalhista', 'civel', 'tributaria']),
  polo: z.enum(['passivo', 'ativo']),
  valor: pos(),
  probabilidade: z.enum(['provavel', 'possivel', 'remota']),
  mesDesfecho: z.number().int().min(1).optional(),
})

export const AberturaSchema = z.object({
  caixa0: z.number(),
  aplicacoes0: pos().default(0),
  taxaAplicacao: pos().default(0),
  unidadeTaxaAplicacao: TaxaUnidade.default('am'),
  cr0: pos().optional(),
  estoque0: pos().default(0),
  imobilizado0: pos().default(0),
  vidaUtilMeses: z.number().gt(0).optional(),
  imoveis0: pos().default(0),
  pctEdificacao: pct().default(0),
  intangivel0: pos().default(0),
  vidaUtilIntangivelMeses: pos().default(0),
  capitalSocial: z.number(),
  dividas: z.array(DividaSchema).default([]),
  contingencias: z.array(ContingenciaSchema).default([]),
  taxaChequeEspecial: pos().default(8),
  unidadeTaxaChequeEspecial: TaxaUnidade.default('am'),
})

export const EventoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('capex'), mes: z.number().int().min(1), valor: z.number().gt(0), vidaUtilMeses: z.number().gt(0) }),
  z.object({ tipo: z.literal('aporte'), mes: z.number().int().min(1), valor: z.number().gt(0) }),
  z.object({ tipo: z.literal('contratacao'), mes: z.number().int().min(1), custoMensalComEncargos: z.number().gt(0) }),
  z.object({ tipo: z.literal('reajusteFolha'), mes: z.number().int().min(1), pct: z.number().gt(-100) }),
])

export const ProjecaoSchema = z.object({
  crescimentoReceita: z.number().default(0),
  sazonalidade: z.array(z.number().gt(0)).length(12).default(Array(12).fill(1)),
  inflacaoCustos: z.number().default(0),
  marketingModo: z.enum(['valor', 'pctRB']).default('valor'),
  aliquotaVendasPorMes: z.array(z.number().min(0).max(100).nullable()).optional(),
  eventos: z.array(EventoSchema).default([]),
})

export const EntradaSchema = z.object({
  empresa: EmpresaSchema,
  /** Data-base do balanço de abertura, 'YYYY-MM-DD'. t=1 é o mês seguinte. */
  dataBase: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  historico: HistoricoSchema,
  abertura: AberturaSchema,
  projecao: ProjecaoSchema.default(() => ProjecaoSchema.parse({})),
})

export const AlavancasSchema = z.object({
  dReceita: z.number().default(0),
  dVariaveis: z.number().default(0),
  dFixos: z.number().default(0),
  dDistribuicao: z.number().default(0),
  dInadimplencia: z.number().default(0),
  dJuros: z.number().default(0),
  dPrazoReceb: z.number().default(0),
  dPrazoPag: z.number().default(0),
})

export type Historico = z.infer<typeof HistoricoSchema>
export type Divida = z.infer<typeof DividaSchema>
export type Contingencia = z.infer<typeof ContingenciaSchema>
export type Abertura = z.infer<typeof AberturaSchema>
export type Evento = z.infer<typeof EventoSchema>
export type Projecao = z.infer<typeof ProjecaoSchema>
/** Entrada já parseada (defaults aplicados). */
export type EntradaSimulacao = z.infer<typeof EntradaSchema>
/** Entrada como o chamador escreve (defaults opcionais). */
export type EntradaBruta = z.input<typeof EntradaSchema>
export type Alavancas = z.infer<typeof AlavancasSchema>
export type AlavancasBruta = z.input<typeof AlavancasSchema>

export interface Cenario {
  id: string
  tipo: 'atual' | 'pessimista' | 'otimista' | 'custom'
  nome: string
  alavancas: AlavancasBruta
}

export interface Config {
  diasAno: 360 | 365
  baseIndicadores: 'antes_distribuicao' | 'apos_distribuicao'
  modoIR: 'informado' | 'regime'
  horizonte: number
}

export const CONFIG_PADRAO: Config = {
  diasAno: 360,
  baseIndicadores: 'antes_distribuicao',
  modoIR: 'informado',
  horizonte: 12,
}

export const ALAVANCAS_ZERO: Alavancas = AlavancasSchema.parse({})

/** Cenários padrão (Seção 4.8, tipo P). */
export const CENARIOS_PADRAO: Cenario[] = [
  { id: 'atual', tipo: 'atual', nome: 'Atual', alavancas: ALAVANCAS_ZERO },
  {
    id: 'pessimista', tipo: 'pessimista', nome: 'Pessimista',
    alavancas: { dReceita: -15, dVariaveis: 10, dFixos: 8, dDistribuicao: 0, dInadimplencia: 2, dJuros: 10, dPrazoReceb: 10, dPrazoPag: -5 },
  },
  {
    id: 'otimista', tipo: 'otimista', nome: 'Otimista',
    alavancas: { dReceita: 15, dVariaveis: -7, dFixos: -5, dDistribuicao: 0, dInadimplencia: -1, dJuros: -10, dPrazoReceb: -5, dPrazoPag: 5 },
  },
]
