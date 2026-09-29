import { alertas } from './alertas'
import { checagens } from './checagens'
import { indicadoresJanela } from './indicadores'
import { simular } from './motor'
import {
  CONFIG_PADRAO, type AlavancasBruta, type Cenario, type Config, type EntradaBruta,
} from './schema'
import { DFC_KEYS, DRE_KEYS, type ChecagemResultado, type Resultado } from './types'
import { somar } from './util'

export const ENGINE_VERSION = '1.0.0'

/** Função pura: mesma entrada → mesma saída. Sem IO, relógio ou aleatoriedade. */
export function calcular(entrada: EntradaBruta, alavancas: AlavancasBruta = {}, cfg: Partial<Config> = {}): Resultado {
  const sim = simular(entrada, alavancas, cfg)
  const { meses, entrada: e } = sim
  const regime = e.empresa.regime

  const porMes = meses.slice(1).map((m) => indicadoresJanela([m], meses[m.t - 1].bp, sim.cfg, regime, meses))
  const anual = indicadoresJanela(meses.slice(1), meses[0].bp, sim.cfg, regime, meses)

  const notas = {
    ativosContingentes: e.abertura.contingencias.filter((c) => c.polo === 'ativo'),
    passivosPossiveis: e.abertura.contingencias.filter((c) => c.polo === 'passivo' && c.probabilidade === 'possivel'),
  }
  const res = {
    engineVersion: ENGINE_VERSION,
    meses,
    anual: {
      dre: somar(DRE_KEYS, meses.slice(1).map((m) => m.dre)),
      dfc: somar(DFC_KEYS, meses.slice(1).map((m) => m.dfc)),
    },
    indicadores: { porMes, anual },
    checagens: [] as ChecagemResultado[],
    alertas: [] as Resultado['alertas'],
    notas,
  } satisfies Resultado
  res.checagens = checagens(meses, e, { anual: res.anual, ind: res.indicadores, notas })
  res.alertas = [...sim.alertasEntrada, ...alertas(meses, porMes, e)]
  return res
}

export function calcularCenarios(entrada: EntradaBruta, cenarios: Cenario[], cfg: Partial<Config> = {}): Record<string, Resultado> {
  const out: Record<string, Resultado> = {}
  for (const c of cenarios) out[c.id] = calcular(entrada, c.alavancas, cfg)
  return out
}

/** C6: cenário com todas as alavancas 0 ≡ cenário Atual (deep-equal). */
export function checagemC6(entrada: EntradaBruta, atual: AlavancasBruta = {}, cfg: Partial<Config> = CONFIG_PADRAO): ChecagemResultado {
  const a = JSON.stringify(calcular(entrada, {}, cfg))
  const b = JSON.stringify(calcular(entrada, atual, cfg))
  return { id: 'C6_cenarioNeutro', mes: 0, ok: a === b, delta: 0 }
}
