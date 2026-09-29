export const EPS = 0.01

/** i_m = (1 + i_a)^(1/12) − 1. `taxaPct` em %. Retorna fração. */
export function taxaMensal(taxaPct: number, unidade: 'am' | 'aa'): number {
  const i = taxaPct / 100
  return unidade === 'am' ? i : Math.pow(1 + i, 1 / 12) - 1
}

export function zeros<K extends string>(keys: readonly K[]): Record<K, number> {
  const o = {} as Record<K, number>
  for (const k of keys) o[k] = 0
  return o
}

export function somar<K extends string>(keys: readonly K[], itens: Record<K, number>[]): Record<K, number> {
  const o = zeros(keys)
  for (const it of itens) for (const k of keys) o[k] += it[k]
  return o
}

/**
 * Agenda `valor` na fila com defasagem em dias (Seção 5.4): L = dias/diasMes,
 * fração (1−f) em t+a e f em t+a+1.
 */
export function agendar(fila: number[], t: number, valor: number, dias: number, diasMes: number): void {
  if (valor === 0) return
  const L = Math.max(0, dias) / diasMes
  let a = Math.floor(L + 1e-9)
  let f = L - a
  if (f < 1e-9) f = 0
  if (a + 1 + t >= fila.length) a = fila.length - 2 - t
  fila[t + a] += valor * (1 - f)
  if (f > 0) fila[t + a + 1] += valor * f
}

/** Liquidação linear de um saldo em `n` meses (t=1..n). */
export function agendarLinear(fila: number[], valor: number, n: number): void {
  if (valor === 0) return
  const m = Math.max(1, n)
  for (let j = 1; j <= m && j < fila.length; j++) fila[j] += valor / m
}

export function div(a: number, b: number): number | null {
  if (b === 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null
  const r = a / b
  return Number.isFinite(r) ? r : null
}

export function competencia(dataBase: string, t: number): string {
  const y = Number(dataBase.slice(0, 4))
  const m = Number(dataBase.slice(5, 7))
  const idx = y * 12 + (m - 1) + t
  const yy = Math.floor(idx / 12)
  const mm = (idx % 12) + 1
  return `${yy}-${String(mm).padStart(2, '0')}`
}
