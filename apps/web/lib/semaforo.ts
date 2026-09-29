import type { IndicadorId, IndicadorValor } from '@sf/engine'

export type Sinal = 'ok' | 'atencao' | 'critico' | null

/** Faixas de leitura dos indicadores (escolha do produto — tipo P). */
const regras: Partial<Record<IndicadorId, (v: number) => Sinal>> = {
  lc: (v) => (v >= 1.2 ? 'ok' : v >= 1 ? 'atencao' : 'critico'),
  ls: (v) => (v >= 1 ? 'ok' : v >= 0.7 ? 'atencao' : 'critico'),
  li: (v) => (v >= 0.3 ? 'ok' : v >= 0.1 ? 'atencao' : 'critico'),
  mcPct: (v) => (v >= 0.3 ? 'ok' : v > 0 ? 'atencao' : 'critico'),
  ebitdaPct: (v) => (v >= 0.1 ? 'ok' : v > 0 ? 'atencao' : 'critico'),
  mlPct: (v) => (v >= 0.05 ? 'ok' : v > 0 ? 'atencao' : 'critico'),
  mso: (v) => (v >= 0.2 ? 'ok' : v >= 0.05 ? 'atencao' : 'critico'),
  icj: (v) => (v >= 2 ? 'ok' : v >= 1 ? 'atencao' : 'critico'),
  dlEbitda: (v) => (v <= 2 ? 'ok' : v <= 3.5 ? 'atencao' : 'critico'),
  endiv: (v) => (v <= 0.6 ? 'ok' : v <= 0.8 ? 'atencao' : 'critico'),
  runway: (v) => (v >= 6 ? 'ok' : v >= 3 ? 'atencao' : 'critico'),
  tesouraria: (v) => (v >= 0 ? 'ok' : 'critico'),
  spread: (v) => (v >= 0 ? 'ok' : 'atencao'),
}

export function semaforo(id: IndicadorId, v: IndicadorValor): Sinal {
  if (v === 'nao_queima') return 'ok'
  if (v === null) return null
  return regras[id]?.(v) ?? null
}
