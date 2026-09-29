import { formatarBRL, formatarDias, formatarPct } from '@sf/engine'

export type Fmt = 'brl' | 'pct' | 'dias' | 'x' | 'meses' | 'num'

export function formatar(v: number | string | null | undefined, fmt: Fmt): string {
  if (v === 'nao_queima') return 'não queima caixa'
  if (v === null || v === undefined || typeof v === 'string') return '—'
  switch (fmt) {
    case 'brl': return formatarBRL(v, 0)
    case 'pct': return formatarPct(v, 1)
    case 'dias': return formatarDias(v)
    case 'x': return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}x`
    case 'meses': return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)} meses`
    default: return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v)
  }
}

export interface Linha {
  chave: string
  rotulo: string
  valores: (number | null)[]
  total?: number | null
  /** colunas extras (ex.: % RB, % RL) */
  extras?: (number | null)[]
  estilo?: 'normal' | 'total' | 'sub' | 'grupo'
  dica?: string
  fmt?: Fmt
  destaque?: number[]
}

export function Tabela({ colunas, linhas, totalRotulo, extrasRotulos, fmt = 'brl' }: {
  colunas: string[]; linhas: Linha[]; totalRotulo?: string; extrasRotulos?: string[]; fmt?: Fmt
}) {
  return (
    <div className="tabela-wrap rounded-lg border border-line bg-card">
      <table className="tabela num w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-paper text-xs text-ink-soft">
            <th className="sticky-col text-left font-medium">&nbsp;</th>
            {colunas.map((c) => <th key={c} className="text-right font-medium">{c}</th>)}
            {totalRotulo && <th className="border-l border-line text-right font-semibold text-ink">{totalRotulo}</th>}
            {extrasRotulos?.map((c) => <th key={c} className="text-right font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            if (l.estilo === 'grupo')
              return (
                <tr key={l.chave} className="bg-brand-soft">
                  <td colSpan={colunas.length + 1 + (totalRotulo ? 1 : 0) + (extrasRotulos?.length ?? 0)} className="sticky-col !bg-brand-soft text-xs font-semibold uppercase tracking-wide text-brand-dark">{l.rotulo}</td>
                </tr>
              )
            const f = l.fmt ?? fmt
            const peso = l.estilo === 'total' ? 'font-semibold' : ''
            const borda = l.estilo === 'total' ? 'border-t border-line' : ''
            return (
              <tr key={l.chave} className={`${peso} ${borda} ${l.estilo === 'total' ? 'linha-total' : ''}`}>
                <td className={`sticky-col text-left ${l.estilo === 'sub' ? 'pl-6 text-ink-soft' : ''}`} title={l.dica}>
                  <span className={l.dica ? 'cursor-help border-b border-dotted border-ink-soft/50' : ''}>{l.rotulo}</span>
                </td>
                {l.valores.map((v, i) => (
                  <td key={i} className={`text-right ${v !== null && v < -0.005 && f === 'brl' ? 'text-bad' : ''} ${l.destaque?.includes(i) ? 'bg-warn-soft' : ''}`}>{formatar(v, f)}</td>
                ))}
                {totalRotulo && <td className={`border-l border-line text-right ${(l.total ?? 0) < -0.005 && f === 'brl' ? 'text-bad' : ''}`}>{formatar(l.total ?? null, f)}</td>}
                {l.extras?.map((v, i) => <td key={i} className="text-right text-ink-soft">{formatar(v, 'pct')}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
