import type { AlertaResultado } from '@sf/engine'

const TOM = {
  critico: 'border-bad/30 bg-bad-soft text-bad',
  atencao: 'border-warn/30 bg-warn-soft text-warn',
  info: 'border-brand/20 bg-brand-soft text-brand-dark',
} as const
const ROTULO = { critico: 'Crítico', atencao: 'Atenção', info: 'Info' } as const

export function Alertas({ lista, compacto = false }: { lista: AlertaResultado[]; compacto?: boolean }) {
  if (lista.length === 0) return compacto ? null : <p className="text-sm text-ink-soft">Nenhum alerta.</p>
  const ordem = { critico: 0, atencao: 1, info: 2 }
  const ord = [...lista].sort((a, b) => ordem[a.nivel] - ordem[b.nivel])
  return (
    <ul className="space-y-1.5">
      {ord.map((a, i) => (
        <li key={`${a.id}-${i}`} className={`rounded-md border px-3 py-1.5 text-sm ${TOM[a.nivel]}`}>
          <b>{ROTULO[a.nivel]}:</b> {a.mensagem}
        </li>
      ))}
    </ul>
  )
}
