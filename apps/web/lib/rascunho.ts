import { CENARIOS_PADRAO, type AlavancasBruta, type EntradaBruta } from '@sf/engine'

export type Regime = 'simples' | 'presumido' | 'real' | 'mei'
export type HistoricoForm = Partial<EntradaBruta['historico']>
export type DividaForm = NonNullable<EntradaBruta['abertura']['dividas']>[number]
export type ContingenciaForm = NonNullable<EntradaBruta['abertura']['contingencias']>[number]
export type EventoForm = NonNullable<NonNullable<EntradaBruta['projecao']>['eventos']>[number]
export type AberturaForm = Omit<Partial<EntradaBruta['abertura']>, 'dividas' | 'contingencias'> & {
  dividas: DividaForm[]
  contingencias: ContingenciaForm[]
}
export type ProjecaoForm = Omit<NonNullable<EntradaBruta['projecao']>, 'eventos'> & { eventos: EventoForm[] }

export interface CenarioForm {
  id: string
  tipo: 'atual' | 'pessimista' | 'otimista' | 'custom'
  nome: string
  descricao?: string
  alavancas: AlavancasBruta
}

/** Rascunho completo de uma simulação — o que o editor edita e o autosave persiste. */
export interface Rascunho {
  nome: string
  dataBase: string
  horizonte: number
  empresa: { razaoSocial: string; regime: Regime; atividadePresumido?: 'comercio_industria' | 'servicos' | null }
  historico: HistoricoForm
  abertura: AberturaForm
  projecao: ProjecaoForm
  cenarios: CenarioForm[]
}

export function paraEntrada(r: Rascunho): EntradaBruta {
  return {
    empresa: { regime: r.empresa.regime, atividadePresumido: r.empresa.atividadePresumido ?? undefined },
    dataBase: r.dataBase,
    historico: r.historico as EntradaBruta['historico'],
    abertura: { caixa0: 0, capitalSocial: 0, ...r.abertura } as EntradaBruta['abertura'],
    projecao: r.projecao,
  }
}

export function rascunhoVazio(empresa: Rascunho['empresa'], nome = 'Nova simulação'): Rascunho {
  const hoje = new Date()
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  const dataBase = `${ultimoDia.getFullYear()}-${String(ultimoDia.getMonth() + 1).padStart(2, '0')}-${String(ultimoDia.getDate()).padStart(2, '0')}`
  return {
    nome, dataBase, horizonte: 12, empresa,
    historico: { pctVista: 100, pctPrazo: 0, pctCartao: 0, prazoCartaoDias: 30 },
    abertura: { dividas: [], contingencias: [], taxaChequeEspecial: 8, unidadeTaxaChequeEspecial: 'am', unidadeTaxaAplicacao: 'am' },
    projecao: { crescimentoReceita: 0, sazonalidade: Array(12).fill(1), inflacaoCustos: 0, marketingModo: 'valor', eventos: [] },
    cenarios: CENARIOS_PADRAO.map((c) => ({ id: c.id, tipo: c.tipo, nome: c.nome, alavancas: { ...c.alavancas } })),
  }
}

/** Dados de demonstração (comércio varejista) — para experimentar o simulador. */
export function preencherExemplo(r: Rascunho): Rascunho {
  return {
    ...r,
    historico: {
      rb12: 2_400_000, pctVista: 30, pctPrazo: 10, pctCartao: 60, descVista: 4,
      prazoRecebDias: 45, prazoCartaoDias: 30, taxaCartao: 2.5, pctAntecipado: 40, taxaAntecipacao: 2,
      pctInadimplencia: 3, pctComissao: 2, compras12: 1_100_000, prazoPagFornecDias: 40,
      frete12: 48_000, impVendas12: 170_000, irCsll12: 0,
      folha12: 420_000, temporarios12: 30_000, proLabore12: 72_000, fixos12: 240_000, marketing12: 36_000, distribuicao12: 120_000,
    },
    abertura: {
      caixa0: 80_000, aplicacoes0: 30_000, taxaAplicacao: 12, unidadeTaxaAplicacao: 'aa',
      estoque0: 220_000, imobilizado0: 90_000, vidaUtilMeses: 60, imoveis0: 300_000, pctEdificacao: 50,
      intangivel0: 24_000, vidaUtilIntangivelMeses: 24, capitalSocial: 100_000,
      taxaChequeEspecial: 8, unidadeTaxaChequeEspecial: 'am',
      dividas: [
        { tipo: 'bancaria', descricao: 'Capital de giro', saldo: 150_000, taxa: 18, unidadeTaxa: 'aa', prazoMeses: 24, sistema: 'price', carenciaMeses: 3, mesInicio: 0, parcelada: true },
        { tipo: 'tributaria', descricao: 'Parcelamento de impostos', saldo: 20_000, taxa: 1, unidadeTaxa: 'am', prazoMeses: 20, sistema: 'sac', carenciaMeses: 0, mesInicio: 0, parcelada: true },
      ],
      contingencias: [
        { natureza: 'trabalhista', polo: 'passivo', valor: 30_000, probabilidade: 'provavel', mesDesfecho: 8 },
        { natureza: 'civel', polo: 'passivo', valor: 50_000, probabilidade: 'possivel' },
      ],
    },
    projecao: {
      crescimentoReceita: 1, inflacaoCustos: 6, marketingModo: 'valor', eventos: [],
      sazonalidade: normalizarSazonalidade([0.9, 0.85, 0.95, 1, 1, 0.95, 1, 1, 1.05, 1.1, 1.05, 1.15]),
    },
  }
}

export function normalizarSazonalidade(a: number[]): number[] {
  const m = a.reduce((s, x) => s + x, 0) / a.length
  return m > 0 ? a.map((x) => x / m) : Array(12).fill(1)
}
