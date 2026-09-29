import type { EntradaBruta } from '../src/schema'

/** Exemplo verificável da Seção 6.11 (mês 1). */
export const ex611: EntradaBruta = {
  empresa: { regime: 'simples' },
  dataBase: '2026-09-30',
  historico: {
    rb12: 1_200_000, pctVista: 40, pctPrazo: 30, pctCartao: 30, descVista: 5,
    prazoRecebDias: 30, prazoCartaoDias: 30, taxaCartao: 3, pctAntecipado: 0, taxaAntecipacao: 0,
    pctInadimplencia: 2, pctComissao: 3, compras12: 480_000, prazoPagFornecDias: 30,
    frete12: 24_000, impVendas12: 70_560, irCsll12: 0,
    folha12: 240_000, fixos12: 120_000,
  },
  abertura: {
    caixa0: 100_000, aplicacoes0: 50_000, taxaAplicacao: 1, unidadeTaxaAplicacao: 'am',
    estoque0: 40_000, imobilizado0: 12_000, vidaUtilMeses: 12, capitalSocial: 50_000,
    dividas: [{ tipo: 'bancaria', saldo: 100_000, taxa: 2, unidadeTaxa: 'am', prazoMeses: 12, sistema: 'price', carenciaMeses: 0, mesInicio: 0, parcelada: true }],
  },
  projecao: { sazonalidade: Array(12).fill(1) },
}

const sazRaw = [0.9, 0.85, 0.95, 1, 1, 0.95, 1, 1, 1.05, 1.1, 1.05, 1.15]
const sazMedia = sazRaw.reduce((s, y) => s + y, 0) / 12

/** Comércio varejista completo: estoque, cartão, antecipação, inadimplência, eventos. */
export const comercio: EntradaBruta = {
  empresa: { regime: 'simples' },
  dataBase: '2026-06-30',
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
    dividas: [
      { tipo: 'bancaria', descricao: 'Capital de giro', saldo: 150_000, taxa: 18, unidadeTaxa: 'aa', prazoMeses: 24, sistema: 'price', carenciaMeses: 3, mesInicio: 0, parcelada: true },
      { tipo: 'bancaria', descricao: 'Financiamento', saldo: 60_000, taxa: 1.5, unidadeTaxa: 'am', prazoMeses: 10, sistema: 'sac', carenciaMeses: 0, mesInicio: 0, parcelada: true },
      { tipo: 'tributaria', saldo: 20_000, taxa: 1, unidadeTaxa: 'am', prazoMeses: 20, sistema: 'sac', carenciaMeses: 0, mesInicio: 0, parcelada: true },
      { tipo: 'bancaria', descricao: 'Captação planejada', saldo: 80_000, taxa: 2, unidadeTaxa: 'am', prazoMeses: 18, sistema: 'price', carenciaMeses: 0, mesInicio: 5, parcelada: true },
    ],
    contingencias: [
      { natureza: 'trabalhista', polo: 'passivo', valor: 30_000, probabilidade: 'provavel', mesDesfecho: 8 },
      { natureza: 'civel', polo: 'passivo', valor: 15_000, probabilidade: 'provavel' },
      { natureza: 'civel', polo: 'passivo', valor: 50_000, probabilidade: 'possivel' },
      { natureza: 'tributaria', polo: 'ativo', valor: 40_000, probabilidade: 'provavel' },
    ],
  },
  projecao: {
    crescimentoReceita: 1, inflacaoCustos: 6, marketingModo: 'valor',
    sazonalidade: sazRaw.map((x) => x / sazMedia),
    eventos: [
      { tipo: 'capex', mes: 3, valor: 60_000, vidaUtilMeses: 36 },
      { tipo: 'aporte', mes: 6, valor: 25_000 },
      { tipo: 'contratacao', mes: 4, custoMensalComEncargos: 4_000 },
      { tipo: 'reajusteFolha', mes: 7, pct: 5 },
    ],
  },
}

/** G4/G5: caixa e PL negativos, tributária não parcelada, contingência provável, sem estoque. */
export const estresse: EntradaBruta = {
  empresa: { regime: 'presumido', atividadePresumido: 'servicos' },
  dataBase: '2026-12-31',
  historico: {
    rb12: 600_000, pctVista: 20, pctPrazo: 60, pctCartao: 20, descVista: 0,
    prazoRecebDias: 90, prazoCartaoDias: 30, taxaCartao: 3, pctAntecipado: 0, taxaAntecipacao: 0,
    pctInadimplencia: 8, pctComissao: 5, compras12: 0, prazoPagFornecDias: 0,
    frete12: 0, impVendas12: 60_000, irCsll12: 12_000,
    folha12: 400_000, fixos12: 250_000, proLabore12: 60_000, distribuicao12: 60_000,
  },
  abertura: {
    caixa0: -10_000, capitalSocial: 10_000,
    dividas: [{ tipo: 'tributaria', saldo: 80_000, taxa: 1, unidadeTaxa: 'am', prazoMeses: 12, sistema: 'sac', carenciaMeses: 0, mesInicio: 0, parcelada: false }],
    contingencias: [{ natureza: 'trabalhista', polo: 'passivo', valor: 90_000, probabilidade: 'provavel' }],
  },
  projecao: {},
}
