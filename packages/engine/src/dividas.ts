import type { Divida } from './schema'
import { taxaMensal } from './util'

export interface CronogramaDivida {
  id: string
  tipo: 'bancaria' | 'tributaria'
  descricao?: string
  inicio: number
  naoParcelada: boolean
  /** Arrays indexados por t = 0..L */
  saldo: number[]
  juros: number[]
  jurosCap: number[]
  amort: number[]
  captacao: number[]
}

/**
 * Cronograma de uma dívida (Seção 6.4). Juros sempre sobre saldo de t−1 (regra anticiclo).
 * `fJuros` só afeta dívidas bancárias (dJuros).
 */
export function cronograma(d: Divida, idx: number, tamanho: number, fJuros: number): CronogramaDivida {
  const i = taxaMensal(d.taxa, d.unidadeTaxa) * (d.tipo === 'bancaria' ? fJuros : 1)
  const inicio = d.mesInicio
  const n = d.prazoMeses
  const L = Math.max(tamanho, inicio + n + 1)
  const mk = () => new Array<number>(L + 1).fill(0)
  const saldo = mk(), juros = mk(), jurosCap = mk(), amort = mk(), captacao = mk()
  const naoParcelada = d.tipo === 'tributaria' && !d.parcelada
  if (inicio > 0) captacao[inicio] = d.saldo
  const S0 = d.saldo
  const c = Math.min(d.carenciaMeses, n - 1)
  const nAm = n - c
  const pmt = d.sistema === 'price' ? (i === 0 ? S0 / nAm : (S0 * i) / (1 - Math.pow(1 + i, -nAm))) : 0
  for (let t = inicio; t <= L; t++) {
    if (t === inicio) { saldo[t] = S0; continue }
    const prev = saldo[t - 1]
    const k = t - inicio
    if (naoParcelada) {
      juros[t] = prev * i
      jurosCap[t] = juros[t]
      saldo[t] = prev + jurosCap[t]
      continue
    }
    if (k > n) { saldo[t] = 0; continue }
    const j = prev * i
    juros[t] = j
    let a = 0
    if (k === n) a = prev
    else if (k > c) {
      if (d.sistema === 'price') a = pmt - j
      else if (d.sistema === 'sac') a = S0 / nAm
    }
    amort[t] = a
    saldo[t] = k === n ? 0 : prev - a
  }
  return { id: d.id ?? `d${idx + 1}`, tipo: d.tipo, descricao: d.descricao, inicio, naoParcelada, saldo, juros, jurosCap, amort, captacao }
}

/** Classificação CP/LP (CPC 26): CP = Σ amortizações dos 12 meses seguintes. */
export function cpLp(c: CronogramaDivida, t: number): { cp: number; lp: number } {
  const s = c.saldo[t] ?? 0
  if (s === 0) return { cp: 0, lp: 0 }
  if (c.naoParcelada) return { cp: s, lp: 0 }
  let cp = 0
  for (let k = 1; k <= 12; k++) cp += c.amort[t + k] ?? 0
  cp = Math.min(cp, s)
  return { cp, lp: s - cp }
}
