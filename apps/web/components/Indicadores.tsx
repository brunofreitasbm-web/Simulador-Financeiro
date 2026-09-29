'use client'
import { REGISTRY, type IndicadorId, type Resultado } from '@sf/engine'
import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { semaforo, type Sinal } from '@/lib/semaforo'
import { fmtInd, GRUPOS_IND } from '@/lib/indicadoresGrupos'
import { formatar } from './Tabela'
import { Card } from './ui'

const COR: Record<NonNullable<Sinal>, string> = { ok: 'bg-ok', atencao: 'bg-warn', critico: 'bg-bad' }
const TXT: Record<NonNullable<Sinal>, string> = { ok: 'Dentro do esperado', atencao: 'Atenção', critico: 'Crítico' }

export function PainelIndicadores({ r }: { r: Resultado }) {
  return (
    <div className="space-y-6">
      {GRUPOS_IND.map((gp) => (
        <section key={gp.titulo}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">{gp.titulo}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {gp.ids.map((id) => <CardIndicador key={id} id={id} r={r} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function CardIndicador({ id, r }: { id: IndicadorId; r: Resultado }) {
  const meta = REGISTRY.indicadores[id]
  const v = r.indicadores.anual[id]
  const f = fmtInd(id)
  const sinal = semaforo(id, v)
  const serie = r.indicadores.porMes.map((m, i) => ({ i, v: typeof m[id] === 'number' ? (m[id] as number) : null }))
  const temSerie = serie.some((p) => p.v !== null)
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="cursor-help text-sm text-ink-soft" title={`${meta.glossario}\nFórmula: ${meta.formulaLegivel}`}>{meta.rotulo}</span>
        {sinal && <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${COR[sinal]}`} title={TXT[sinal]} />}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="num text-lg font-semibold" title={v === null ? `Indisponível: ${meta.nullQuando ?? 'base inválida'}` : undefined}>
          {formatar(v, f)}
        </div>
        {temSerie && (
          <div className="h-8 w-20">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie}><Line type="monotone" dataKey="v" stroke="#0f6b62" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls /></LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {v === null && <div className="mt-1 text-xs text-ink-soft">— {meta.nullQuando ? `(${meta.nullQuando})` : ''}</div>}
    </Card>
  )
}
