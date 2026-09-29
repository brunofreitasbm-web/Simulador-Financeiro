import { aplicarCenario, calibrar } from './calibrar'
import { cpLp, cronograma } from './dividas'
import {
  AlavancasSchema, CONFIG_PADRAO,
  type AlavancasBruta, type Config, type EntradaBruta, type EntradaSimulacao,
} from './schema'
import {
  AUX_KEYS, BP_KEYS, DFC_KEYS, DRE_KEYS,
  type Aux, type BP, type DFC, type DRE, type LinhaDivida, type Mes,
} from './types'
import { agendar, agendarLinear, competencia, taxaMensal, zeros } from './util'
import { validar } from './validar'
import type { AlertaResultado } from './types'

export class EntradaInvalidaError extends Error {
  constructor(public erros: string[]) {
    super(`Entrada inválida:\n- ${erros.join('\n- ')}`)
    this.name = 'EntradaInvalidaError'
  }
}

export interface Simulacao {
  entrada: EntradaSimulacao
  cfg: Config
  meses: Mes[]
  alertasEntrada: AlertaResultado[]
}

interface Depreciavel { mensal: number; restante: number; inicio: number }

/**
 * Núcleo: projeta H meses. Ordem de cálculo da Seção 6.2; regra anticiclo (6.1): juros,
 * receita financeira e cheque especial usam sempre saldos de t−1.
 */
export function simular(entradaBruta: EntradaBruta, alavancasBruta: AlavancasBruta = {}, cfgParcial: Partial<Config> = {}): Simulacao {
  const cfg: Config = { ...CONFIG_PADRAO, ...cfgParcial }
  if (cfg.modoIR !== 'informado') throw new Error("modoIR 'regime' ainda não implementado (v1)")
  if (!(cfg.horizonte >= 1 && cfg.horizonte <= 60)) throw new Error('horizonte deve estar entre 1 e 60')
  const v = validar(entradaBruta)
  if (!v.ok) throw new EntradaInvalidaError(v.erros)
  const e = v.entrada
  const alav = AlavancasSchema.parse(alavancasBruta)
  const H = cfg.horizonte
  const dm = cfg.diasAno / 12
  const h = e.historico, ab = e.abertura, pj = e.projecao

  // 2–3. calibração + cenário
  const cal = calibrar(e, cfg)
  const drv = aplicarCenario(e, cal, alav)

  // taxas
  const iApl = taxaMensal(ab.taxaAplicacao, ab.unidadeTaxaAplicacao)
  const iChq = taxaMensal(ab.taxaChequeEspecial, ab.unidadeTaxaChequeEspecial) * drv.fJuros
  const iInfl = Math.pow(1 + pj.inflacaoCustos / 100, 1 / 12) - 1
  const g = pj.crescimentoReceita / 100

  // dívidas
  const crons = ab.dividas.map((d, i) => cronograma(d, i, H + 14, drv.fJuros))

  // contingências
  const passivosProv = ab.contingencias.filter((c) => c.polo === 'passivo' && c.probabilidade === 'provavel')
  const provEm = (t: number) => {
    let cp = 0, lp = 0
    for (const c of passivosProv) {
      if (c.mesDesfecho !== undefined && c.mesDesfecho <= t) continue
      if (c.mesDesfecho !== undefined && c.mesDesfecho <= t + 12) cp += c.valor
      else lp += c.valor
    }
    return { cp, lp }
  }

  // filas de defasagem (índice = mês de liquidação)
  const N = H + 80
  const filaPrazo = new Array<number>(N).fill(0)
  const filaCartao = new Array<number>(N).fill(0)
  const filaCr0 = new Array<number>(N).fill(0)
  const filaForn = new Array<number>(N).fill(0)
  agendarLinear(filaCr0, cal.cr0, Math.ceil(h.prazoRecebDias / dm))
  const forn0 = (h.compras12 / cfg.diasAno) * cal.pmpc0
  agendarLinear(filaForn, forn0, Math.ceil(cal.pmpc0 / dm))

  // depreciação
  const depImob: Depreciavel = { mensal: ab.vidaUtilMeses ? ab.imobilizado0 / ab.vidaUtilMeses : 0, restante: ab.imobilizado0, inicio: 1 }
  const edif = (ab.imoveis0 * ab.pctEdificacao) / 100
  const depImovel: Depreciavel = { mensal: edif / 300, restante: edif, inicio: 1 }
  const depInt: Depreciavel = {
    mensal: ab.vidaUtilIntangivelMeses > 0 ? ab.intangivel0 / ab.vidaUtilIntangivelMeses : 0,
    restante: ab.intangivel0, inicio: 1,
  }
  const depCapex: Depreciavel[] = pj.eventos
    .filter((ev) => ev.tipo === 'capex')
    .map((ev) => ({ mensal: ev.valor / ev.vidaUtilMeses, restante: ev.valor, inicio: ev.mes + 1 }))
  const depreciar = (d: Depreciavel, t: number) => {
    if (t < d.inicio || d.restante <= 0) return 0
    const x = Math.min(d.mensal, d.restante)
    d.restante -= x
    return x
  }

  // ---- t = 0 : balanço de abertura ----
  const baseMes = Number(e.dataBase.slice(5, 7))
  const desc12 = h.rb12 * cal.pctVista * cal.descVista
  const comissaoEst12 = (h.rb12 - desc12) * (h.pctComissao / 100)
  const cap0 = (h.impVendas12 + comissaoEst12 + h.folha12 + h.temporarios12 + h.proLabore12 + h.irCsll12) / 12

  const linhasDivida = (t: number): LinhaDivida[] =>
    crons.map((c) => {
      const { cp, lp } = cpLp(c, t)
      return {
        id: c.id, tipo: c.tipo, descricao: c.descricao,
        saldoInicial: t === 0 ? c.saldo[0] : c.saldo[t - 1],
        captacao: t === 0 ? 0 : c.captacao[t],
        juros: t === 0 ? 0 : c.juros[t],
        jurosCapitalizados: t === 0 ? 0 : c.jurosCap[t],
        amortizacao: t === 0 ? 0 : c.amort[t],
        saldoFinal: c.saldo[t], cp, lp,
      }
    })

  const montarBP = (p: {
    caixa: number; aplic: number; cr: number; pdd: number; est: number; imob: number; intang: number
    forn: number; cap: number; capital: number; la: number; t: number
  }): BP => {
    const ld = linhasDivida(p.t)
    const soma = (tipo: 'bancaria' | 'tributaria', k: 'cp' | 'lp') => ld.filter((d) => d.tipo === tipo).reduce((s, d) => s + d[k], 0)
    const pv = provEm(p.t)
    const bp = zeros(BP_KEYS)
    bp.caixa = p.caixa; bp.aplicacoes = p.aplic; bp.contasReceber = p.cr; bp.pdd = p.pdd; bp.estoque = p.est
    bp.ac = p.caixa + p.aplic + p.cr - p.pdd + p.est
    bp.imobilizado = p.imob; bp.intangivel = p.intang
    bp.anc = p.imob + p.intang
    bp.ativo = bp.ac + bp.anc
    bp.fornecedores = p.forn; bp.contasAPagar = p.cap
    bp.emprestimosCP = soma('bancaria', 'cp'); bp.parcelamentosCP = soma('tributaria', 'cp'); bp.provisoesCP = pv.cp
    bp.pc = p.forn + p.cap + bp.emprestimosCP + bp.parcelamentosCP + bp.provisoesCP
    bp.emprestimosLP = soma('bancaria', 'lp'); bp.parcelamentosLP = soma('tributaria', 'lp'); bp.provisoesLP = pv.lp
    bp.pnc = bp.emprestimosLP + bp.parcelamentosLP + bp.provisoesLP
    bp.capitalSocial = p.capital; bp.lucrosAcumulados = p.la
    bp.pl = p.capital + p.la
    bp.passivoPL = bp.pc + bp.pnc + bp.pl
    return bp
  }

  const bpSemPlug = montarBP({
    caixa: ab.caixa0, aplic: ab.aplicacoes0, cr: cal.cr0, pdd: 0, est: ab.estoque0,
    imob: ab.imobilizado0 + ab.imoveis0, intang: ab.intangivel0,
    forn: forn0, cap: cap0, capital: ab.capitalSocial, la: 0, t: 0,
  })
  const plug0 = bpSemPlug.ativo - bpSemPlug.pc - bpSemPlug.pnc - ab.capitalSocial
  const bp0 = montarBP({
    caixa: ab.caixa0, aplic: ab.aplicacoes0, cr: cal.cr0, pdd: 0, est: ab.estoque0,
    imob: ab.imobilizado0 + ab.imoveis0, intang: ab.intangivel0,
    forn: forn0, cap: cap0, capital: ab.capitalSocial, la: plug0, t: 0,
  })
  const aux0 = zeros(AUX_KEYS); aux0.estoqueFinal = ab.estoque0; aux0.caixaDireto = ab.caixa0
  const meses: Mes[] = [{
    t: 0, competencia: competencia(e.dataBase, 0),
    dre: zeros(DRE_KEYS), bp: bp0, dfc: zeros(DFC_KEYS), aux: aux0, dividas: linhasDivida(0),
  }]

  // estado corrente
  let caixa = ab.caixa0, aplic = ab.aplicacoes0, cr = cal.cr0, pdd = 0, est = ab.estoque0
  let imob = ab.imobilizado0 + ab.imoveis0, intang = ab.intangivel0
  let forn = forn0, cap = cap0, capital = ab.capitalSocial, la = plug0
  let caixaDireto = ab.caixa0
  let provPrev = provEm(0).cp + provEm(0).lp

  // ---- t = 1..H ----
  for (let t = 1; t <= H; t++) {
    const k = (baseMes + t - 1) % 12
    const dre = zeros(DRE_KEYS)
    const dfc = zeros(DFC_KEYS)
    const aux = zeros(AUX_KEYS)

    // a. receita, descontos, impostos
    const rb = (h.rb12 / 12) * Math.pow(1 + g, t) * pj.sazonalidade[k] * drv.fRec
    const vista = rb * cal.pctVista, prazo = rb * cal.pctPrazo, cartao = rb * cal.pctCartao
    const desc = vista * drv.descVista
    const ov = pj.aliquotaVendasPorMes?.[t - 1]
    const aliq = ov !== undefined && ov !== null ? ov / 100 : drv.aliqVendas
    const imp = (rb - desc) * aliq

    // b. CMV, estoque, compras
    const cmv = rb * drv.cmvPct
    let estFin = est, compras = 0
    if (cal.pmre0 !== null) {
      const alvo = (cmv * cal.pmre0) / dm
      compras = cmv + alvo - est
      estFin = alvo
      if (compras < 0) { estFin = Math.max(0, est - cmv); compras = cmv + estFin - est }
    } else {
      compras = cmv
    }
    agendar(filaForn, t, compras, drv.prazoPagDias, dm)

    // c. despesas variáveis
    const comissao = (rb - desc) * drv.comissao
    const mdr = cartao * drv.taxaCartao
    const frete = rb * drv.fretePct
    const prazoCred = prazo * (1 - drv.pctAnt)
    const perdas = prazoCred * drv.inad

    // d. gastos fixos
    let pessoal = cal.pessoalBase_m
    for (const ev of pj.eventos) if (ev.tipo === 'contratacao' && ev.mes <= t) pessoal += ev.custoMensalComEncargos
    for (const ev of pj.eventos) if (ev.tipo === 'reajusteFolha' && ev.mes <= t) pessoal *= 1 + ev.pct / 100
    pessoal *= drv.fFixos
    const fatInfl = Math.pow(1 + iInfl, t)
    const gastosFixos = cal.fixosBase_m * fatInfl * drv.fFixos
    const marketing = pj.marketingModo === 'valor' ? cal.marketingBase_m * fatInfl * drv.fFixos : rb * cal.marketingPctRB * drv.fFixos
    const dasMei = cal.dasMei_m

    // e. depreciação
    let depMat = depreciar(depImob, t) + depreciar(depImovel, t)
    for (const d of depCapex) depMat += depreciar(d, t)
    const depIntang = depreciar(depInt, t)
    const dep = depMat + depIntang
    let capex = 0, aporte = 0
    for (const ev of pj.eventos) {
      if (ev.tipo === 'capex' && ev.mes === t) capex += ev.valor
      if (ev.tipo === 'aporte' && ev.mes === t) aporte += ev.valor
    }

    // f. dívidas (saldo t−1)
    const ld = linhasDivida(t)
    const jurosDiv = ld.reduce((s, d) => s + d.juros, 0)
    const jurosCap = ld.reduce((s, d) => s + d.jurosCapitalizados, 0)
    const amortDiv = ld.reduce((s, d) => s + d.amortizacao, 0)
    const captDiv = ld.reduce((s, d) => s + d.captacao, 0)

    // g. financeiro (saldos t−1)
    const recFin = aplic * iApl
    const cheque = Math.max(0, -caixa) * iChq

    // h. custo de antecipação
    const custoAnt =
      prazo * drv.pctAnt * drv.taxaAnt_m * (drv.prazoRecebDias / dm) +
      cartao * drv.pctAnt * drv.taxaAnt_m * (drv.prazoCartaoDias / dm)

    // i. resultado
    const rl = rb - desc - imp
    const mc = rl - cmv - comissao - mdr - frete - perdas
    const ebitda = mc - pessoal - gastosFixos - marketing - dasMei
    const ebit = ebitda - dep
    const despFin = jurosDiv + cheque + custoAnt
    const lair = ebit - despFin + recFin
    const ir = cal.irCsll_m
    const ll = lair - ir
    const distrib = cal.distrib_m * drv.fDistrib
    Object.assign(dre, {
      rb, descontos: desc, impostos: imp, rl, cmv, comissoes: comissao, taxaCartao: mdr, frete, perdas, mc,
      pessoal, gastosFixos, marketing, dasMei, ebitda, depreciacao: dep, ebit,
      despFinDividas: jurosDiv, despFinCheque: cheque, despFinAntecipacao: custoAnt, despFinanceiras: despFin,
      recFinanceiras: recFin, lair, irCsll: ir, ll, distribuicao: distrib, resultadoApos: ll - distrib,
    } satisfies DRE)

    // j. recebimentos e pagamentos
    const prazoCredAdd = prazoCred
    const cartaoCredAdd = cartao * (1 - drv.pctAnt) * (1 - drv.taxaCartao)
    agendar(filaPrazo, t, prazoCredAdd, drv.prazoRecebDias, dm)
    agendar(filaCartao, t, cartaoCredAdd, drv.prazoCartaoDias, dm)
    const baixaCR = filaPrazo[t] + filaCartao[t] + filaCr0[t]
    const pddBaixa = filaPrazo[t] * drv.inad
    const recebPrazo = filaPrazo[t] * (1 - drv.inad)
    const recebimentos =
      vista - desc +
      prazo * drv.pctAnt + cartao * drv.pctAnt * (1 - drv.taxaCartao) +
      recebPrazo + filaCartao[t] + filaCr0[t]
    const pagFornec = filaForn[t]
    const capNovo = imp + comissao + pessoal + ir
    const contPag = passivosProv.filter((c) => c.mesDesfecho === t).reduce((s, c) => s + c.valor, 0)
    const jurosPagos = jurosDiv - jurosCap
    const saidas =
      pagFornec + cap /* contas a pagar de t−1 */ + frete + gastosFixos + marketing + dasMei +
      cheque + custoAnt + jurosPagos + amortDiv + capex + distrib + contPag
    caixaDireto += recebimentos - saidas + captDiv + aporte

    const crNovo = cr + prazoCredAdd + cartaoCredAdd - baixaCR
    const pddNovo = pdd + perdas - pddBaixa
    const fornNovo = forn + compras - pagFornec
    const provNow = provEm(t)
    const provNovo = provNow.cp + provNow.lp
    const aplicNovo = aplic + recFin
    const imobNovo = imob + capex - depMat
    const intangNovo = intang - depIntang

    // k. DFC (método indireto; sinais = efeito no caixa)
    dfc.ll = ll
    dfc.depreciacao = dep
    dfc.varPdd = pddNovo - pdd
    dfc.jurosCapitalizados = jurosCap
    dfc.varContasReceber = -(crNovo - cr)
    dfc.varEstoque = -(estFin - est)
    dfc.varFornecedores = fornNovo - forn
    dfc.varContasAPagar = capNovo - cap
    dfc.varProvisoes = provNovo - provPrev
    dfc.fco = dfc.ll + dfc.depreciacao + dfc.varPdd + dfc.jurosCapitalizados + dfc.varContasReceber +
      dfc.varEstoque + dfc.varFornecedores + dfc.varContasAPagar + dfc.varProvisoes
    dfc.capex = -capex
    dfc.varAplicacoes = -(aplicNovo - aplic)
    dfc.fci = dfc.capex + dfc.varAplicacoes
    dfc.captacoes = captDiv
    dfc.amortizacoes = -amortDiv
    dfc.aportes = aporte
    dfc.distribuicao = -distrib
    dfc.fcf = dfc.captacoes + dfc.amortizacoes + dfc.aportes + dfc.distribuicao
    dfc.deltaCaixa = dfc.fco + dfc.fci + dfc.fcf

    // l. BP
    imob = imobNovo; intang = intangNovo
    caixa += dfc.deltaCaixa
    aplic = aplicNovo; cr = crNovo; pdd = pddNovo; est = estFin; forn = fornNovo; cap = capNovo
    capital += aporte
    la = la + ll - distrib
    provPrev = provNovo
    const bp = montarBP({ caixa, aplic, cr, pdd, est, imob, intang, forn, cap, capital, la, t })

    aux.compras = compras
    aux.estoqueFinal = estFin
    aux.gastosFixosTotal = pessoal + gastosFixos + marketing + dasMei
    aux.jurosDividasPagos = jurosPagos
    aux.caixaDireto = caixaDireto
    meses.push({ t, competencia: competencia(e.dataBase, t), dre, bp, dfc, aux, dividas: ld })
  }

  return { entrada: e, cfg, meses, alertasEntrada: v.alertas }
}
