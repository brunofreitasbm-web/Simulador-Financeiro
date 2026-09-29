const nf = (min: number, max: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })

/** Só formata — nunca calcula. `null` → "—". */
export function formatarBRL(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = nf(casas, casas).format(Math.abs(v))
  return `${v < 0 ? '-' : ''}R$ ${s}`
}

/** `v` é fração (0,123 → "12,3%"). */
export function formatarPct(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${nf(casas, casas).format(v * 100)}%`
}

export function formatarDias(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${nf(0, 0).format(v)} dias`
}
