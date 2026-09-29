import type { Alavancas, Config, EntradaSimulacao } from './schema'

/** Calibração (Seção 5.1) — frações, não percentuais. */
export interface Calibracao {
  pctVista: number; pctPrazo: number; pctCartao: number
  descVista: number
  aliqVendas: number
  cmvPct: number
  fretePct: number
  cmv12: number
  pmre0: number | null
  pmpc0: number
  pessoalBase_m: number
  fixosBase_m: number
  marketingBase_m: number
  marketingPctRB: number
  distrib_m: number
  irCsll_m: number
  dasMei_m: number
  cr0: number
}

export function calibrar(e: EntradaSimulacao, cfg: Config): Calibracao {
  const h = e.historico
  const pctVista = h.pctVista / 100, pctPrazo = h.pctPrazo / 100, pctCartao = h.pctCartao / 100
  const descVista = h.descVista / 100
  const desc12 = h.rb12 * pctVista * descVista
  const baseImp12 = h.rb12 - desc12
  const mei = e.empresa.regime === 'mei'
  const aliqVendas = mei || baseImp12 <= 0 ? 0 : h.impVendas12 / baseImp12
  const cmv12 = h.compras12
  const pmre0 = cmv12 > 0 ? e.abertura.estoque0 / (cmv12 / cfg.diasAno) : null
  const modoValor = e.projecao.marketingModo === 'valor'
  const pAnt = h.pctAntecipado / 100
  const cr0 =
    e.abertura.cr0 ??
    (h.rb12 / cfg.diasAno) * (pctPrazo * h.prazoRecebDias + pctCartao * h.prazoCartaoDias) * (1 - pAnt)
  return {
    pctVista, pctPrazo, pctCartao, descVista, aliqVendas,
    cmvPct: cmv12 / h.rb12,
    fretePct: h.frete12 / h.rb12,
    cmv12, pmre0,
    pmpc0: h.prazoPagFornecDias,
    pessoalBase_m: (h.folha12 + h.temporarios12 + h.proLabore12) / 12,
    fixosBase_m: h.fixos12 / 12,
    marketingBase_m: modoValor ? h.marketing12 / 12 : 0,
    marketingPctRB: modoValor ? 0 : h.marketing12 / h.rb12,
    distrib_m: h.distribuicao12 / 12,
    irCsll_m: h.irCsll12 / 12,
    dasMei_m: mei ? h.dasMei_m : 0,
    cr0,
  }
}

/** Drivers já ajustados pelo cenário (Seção 4.8). Frações. */
export interface Drivers {
  fRec: number
  cmvPct: number
  comissao: number
  taxaCartao: number
  aliqVendas: number
  fretePct: number
  inad: number
  fFixos: number
  fDistrib: number
  fJuros: number
  prazoRecebDias: number
  prazoPagDias: number
  prazoCartaoDias: number
  pctAnt: number
  taxaAnt_m: number
  descVista: number
}

export function aplicarCenario(e: EntradaSimulacao, cal: Calibracao, a: Alavancas): Drivers {
  const h = e.historico
  const v = 1 + a.dVariaveis / 100
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
  return {
    fRec: 1 + a.dReceita / 100,
    cmvPct: cal.cmvPct * v,
    comissao: (h.pctComissao / 100) * v,
    taxaCartao: (h.taxaCartao / 100) * v,
    aliqVendas: cal.aliqVendas * v,
    fretePct: cal.fretePct * v,
    inad: clamp01(h.pctInadimplencia / 100 + a.dInadimplencia / 100),
    fFixos: 1 + a.dFixos / 100,
    fDistrib: 1 + a.dDistribuicao / 100,
    fJuros: 1 + a.dJuros / 100,
    prazoRecebDias: Math.max(0, h.prazoRecebDias + a.dPrazoReceb),
    prazoPagDias: Math.max(0, h.prazoPagFornecDias + a.dPrazoPag),
    prazoCartaoDias: h.prazoCartaoDias,
    pctAnt: h.pctAntecipado / 100,
    taxaAnt_m: h.taxaAntecipacao / 100,
    descVista: cal.descVista,
  }
}
