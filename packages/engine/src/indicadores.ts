import type { Config } from './schema'
import { DFC_KEYS, DRE_KEYS, IND_IDS, type BP, type Indicadores, type IndicadorValor, type Mes } from './types'
import { div, somar } from './util'

const ok = (x: number | null): x is number => x !== null

/**
 * Indicadores de uma janela de meses (Seção 6.10). Mensal: janela = [t]; anual: 1..H.
 * Fluxos = Σ da janela; saldos = fim da janela (`bpIni` = balanço anterior à janela).
 * null quando a base é inválida — nunca 0/NaN.
 */
export function indicadoresJanela(
  janela: Mes[], bpIni: BP, cfg: Config, regime: string, historicoCompleto: Mes[],
): Indicadores {
  const n = janela.length
  const dm = cfg.diasAno / 12
  const dias = n * dm
  const anualiza = 12 / n
  const fim = janela[n - 1].bp
  const d = somar(DRE_KEYS, janela.map((m) => m.dre))
  const f = somar(DFC_KEYS, janela.map((m) => m.dfc))
  const compras = janela.reduce((s, m) => s + m.aux.compras, 0)
  const gf = janela.reduce((s, m) => s + m.aux.gastosFixosTotal, 0)
  const amort = -f.amortizacoes
  const ll = cfg.baseIndicadores === 'antes_distribuicao' ? d.ll : d.resultadoApos

  const o = {} as Record<string, IndicadorValor>
  for (const id of IND_IDS) o[id] = null

  o.rbMensal = d.rb / n
  o.gvPct = div(d.impostos + d.cmv + d.comissoes + d.taxaCartao + d.frete + d.perdas, d.rb)
  const rlPos = d.rl > 0
  o.mcPct = rlPos ? div(d.mc, d.rl) : null
  o.ebitdaPct = rlPos ? div(d.ebitda, d.rl) : null
  o.ebitPct = rlPos ? div(d.ebit, d.rl) : null
  o.mlPct = rlPos ? div(ll, d.rl) : null

  const mcPct = o.mcPct as number | null
  const mcOk = mcPct !== null && mcPct > 0
  const gfm = gf / n, depm = d.depreciacao / n
  const pec = mcOk ? (gfm + depm) / mcPct! : null
  o.pec = pec
  o.pecRB = pec !== null && d.rb > 0 && d.rl > 0 ? pec / (d.rl / d.rb) : null
  o.pef = mcOk ? (gfm + d.despFinanceiras / n + amort / n - depm) / mcPct! : null
  o.mso = pec !== null && rlPos ? (d.rl / n - pec) / (d.rl / n) : null
  o.gao = d.ebit > 0 ? div(d.mc, d.ebit) : null

  o.pmre = d.cmv > 0 ? div(fim.estoque, d.cmv / dias) : null
  o.pmrv = d.rb > 0 ? div(fim.contasReceber, d.rb / dias) : null
  o.pmpc = compras > 0 ? div(fim.fornecedores, compras / dias) : null
  o.co = ok(o.pmre as number | null) && ok(o.pmrv as number | null) ? (o.pmre as number) + (o.pmrv as number) : null
  o.cf = ok(o.co as number | null) && ok(o.pmpc as number | null) ? (o.co as number) - (o.pmpc as number) : null

  const ncg = fim.contasReceber - fim.pdd + fim.estoque - (fim.fornecedores + fim.contasAPagar)
  const cdg = fim.pl + fim.pnc - fim.anc
  o.ncg = ncg
  o.ncgDias = d.rb > 0 ? div(ncg, d.rb / dias) : null
  o.cdg = cdg
  o.tesouraria = cdg - ncg

  o.lc = fim.pc > 0 ? div(fim.ac, fim.pc) : null
  o.ls = fim.pc > 0 ? div(fim.ac - fim.estoque, fim.pc) : null
  o.li = fim.pc > 0 ? div(fim.caixa + fim.aplicacoes, fim.pc) : null
  o.lg = fim.pc + fim.pnc > 0 ? div(fim.ac, fim.pc + fim.pnc) : null

  // runway: queima média dos últimos 3 meses (P)
  const ate = janela[n - 1].t
  const ult = historicoCompleto.filter((m) => m.t >= Math.max(1, ate - 2) && m.t <= ate)
  const fluxo = ult.reduce((s, m) => s + m.dfc.fco + m.dfc.captacoes + m.dfc.amortizacoes, 0) / Math.max(1, ult.length)
  const queima = -fluxo
  const liquidez = fim.caixa + fim.aplicacoes
  o.runway = queima <= 0 ? 'nao_queima' : Math.max(0, liquidez) / queima

  const divida = (b: BP) => b.emprestimosCP + b.emprestimosLP + b.parcelamentosCP + b.parcelamentosLP
  const ebitdaAnual = d.ebitda * anualiza
  o.dlEbitda = ebitdaAnual > 0 ? (divida(fim) - fim.caixa - fim.aplicacoes) / ebitdaAnual : null
  o.icj = d.despFinanceiras > 0 ? div(d.ebit, d.despFinanceiras) : null
  o.icjEbitda = d.despFinanceiras > 0 ? div(d.ebitda, d.despFinanceiras) : null
  o.endiv = fim.ativo > 0 ? div(fim.pc + fim.pnc, fim.ativo) : null
  o.ipl = fim.pl > 0 ? div(fim.anc, fim.pl) : null

  const tEf = regime === 'simples' || regime === 'mei' || d.lair <= 0 ? 0 : Math.min(1, Math.max(0, d.irCsll / d.lair))
  const plMed = (bpIni.pl + fim.pl) / 2
  const ativoMed = (bpIni.ativo + fim.ativo) / 2
  o.roe = plMed > 0 ? (ll * anualiza) / plMed : null
  o.roa = ativoMed > 0 ? (d.ebit * (1 - tEf) * anualiza) / ativoMed : null
  const ci = ncg + fim.anc
  const roic = ci > 0 ? (d.ebit * (1 - tEf) * anualiza) / ci : null
  o.roic = roic
  const dividaMed = (divida(bpIni) + divida(fim)) / 2
  o.spread = roic !== null && dividaMed > 0 ? roic - ((d.despFinanceiras * anualiza) / dividaMed) * (1 - tEf) : null
  o.gfRl = rlPos ? div(gf, d.rl) : null
  o.custoVender = d.rb > 0 ? (d.comissoes + d.taxaCartao + d.despFinAntecipacao + d.frete + d.marketing) / d.rb : null
  const estMed = (bpIni.estoque + fim.estoque) / 2
  o.giroEstoque = estMed > 0 ? (d.cmv * anualiza) / estMed : null

  return o as Indicadores
}
