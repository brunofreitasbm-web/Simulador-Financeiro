import type { EntradaSimulacao } from './schema'
import type { AlertaResultado, Indicadores, Mes } from './types'
import { competencia } from './util'

/** Alertas de negócio (Seção 6.13) — não bloqueiam. Cada alerta é reportado no 1º mês em que ocorre. */
export function alertas(meses: Mes[], porMes: Indicadores[], entrada: EntradaSimulacao): AlertaResultado[] {
  const out: AlertaResultado[] = []
  const primeiro = (pred: (m: Mes, i: number) => boolean) => meses.find((m, i) => pred(m, i))
  const push = (id: string, nivel: AlertaResultado['nivel'], mensagem: string, mes?: number) =>
    out.push({ id, nivel, mensagem, ...(mes !== undefined ? { mes } : {}) })

  const cx = primeiro((m) => m.bp.caixa < 0)
  if (cx) push('A_caixaNegativo', 'critico', `Caixa negativo a partir de ${cx.competencia}.`, cx.t)
  const pl = primeiro((m) => m.bp.pl < 0)
  if (pl) push('A_plNegativo', 'critico', `Patrimônio líquido negativo${pl.t === 0 ? ' já na abertura' : ` a partir de ${pl.competencia}`}.`, pl.t)
  const sd = primeiro((m) => m.t > 0 && m.dre.despFinDividas + m.dfc.amortizacoes * -1 > m.dre.ebitda)
  if (sd) push('A_servicoDivida', 'atencao', `Serviço da dívida (juros + amortização) supera o EBITDA em ${sd.competencia}.`, sd.t)
  const rwC = porMes.findIndex((ind) => typeof ind.runway === 'number' && ind.runway < 3)
  if (rwC >= 0) push('A_runway', 'critico', `Autonomia de caixa inferior a 3 meses em ${meses[rwC + 1].competencia}.`, rwC + 1)
  else {
    const rwA = porMes.findIndex((ind) => typeof ind.runway === 'number' && ind.runway < 6)
    if (rwA >= 0) push('A_runway', 'atencao', `Autonomia de caixa inferior a 6 meses em ${meses[rwA + 1].competencia}.`, rwA + 1)
  }
  const mc = primeiro((m) => m.t > 0 && m.dre.mc < 0)
  if (mc) push('A_mcNegativa', 'critico', `Margem de contribuição negativa em ${mc.competencia}.`, mc.t)
  if ((entrada.empresa.regime === 'simples' || entrada.empresa.regime === 'mei') && entrada.historico.irCsll12 > 0)
    push('A_duplaIR', 'atencao', 'IR/CSLL informado em regime Simples/MEI: pode haver dupla contagem com o DAS.')
  const ez = primeiro((m) => m.t > 0 && m.aux.estoqueFinal === 0 && m.dre.cmv > 0)
  if (ez) push('A_estoqueZerado', 'atencao', `Estoque zerado com CMV positivo em ${ez.competencia}.`, ez.t)
  if (entrada.abertura.dividas.some((d) => d.tipo === 'tributaria' && !d.parcelada))
    push('A_tributariaNaoParcelada', 'atencao', 'Existe dívida tributária não parcelada (acumula Selic, 100% no curto prazo).')
  const H = meses.length - 1
  const ov = entrada.projecao.aliquotaVendasPorMes
  const cruza = meses.some((m) => m.t > 0 && m.competencia >= '2027-01' && (ov?.[m.t - 1] === undefined || ov[m.t - 1] === null))
  if (cruza && competencia(entrada.dataBase, H) >= '2027-01')
    push('A_aliquotaReforma', 'info', 'O horizonte cruza 01/2027 (reforma tributária CBS/IBS) sem alíquota de vendas informada para esses meses.')
  return out
}
