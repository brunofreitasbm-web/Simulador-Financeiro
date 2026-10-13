'use client'

import type { IndicadoresSaude } from '@/lib/saudeReal'

interface Props {
  saude: IndicadoresSaude
}

const CORES_STATUS = {
  verde: {
    bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800',
    dot: 'bg-emerald-500 ring-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    title: 'text-emerald-950',
    progress: 'bg-emerald-500',
  },
  amarelo: {
    bg: 'bg-amber-500/10 border-amber-500/30 text-amber-800',
    dot: 'bg-amber-500 ring-amber-200',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    title: 'text-amber-950',
    progress: 'bg-amber-500',
  },
  vermelho: {
    bg: 'bg-rose-500/10 border-rose-500/30 text-rose-800',
    dot: 'bg-rose-500 ring-rose-200',
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
    title: 'text-rose-950',
    progress: 'bg-rose-500',
  },
} as const

export function SemaforosSaude({ saude }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <span>🩺</span> Diagnóstico de Saúde Financeira
          <span className="text-xs font-normal text-ink-soft bg-paper px-2 py-0.5 rounded border border-line">
            Competência {saude.competencia}
          </span>
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {saude.semaforos.map((item) => {
          const estilo = CORES_STATUS[item.status]
          return (
            <div
              key={item.id}
              className={`relative flex flex-col justify-between rounded-xl border p-4 shadow-xs transition-all hover:shadow-md ${estilo.bg} bg-white`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                    {item.titulo}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${estilo.badge}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${estilo.dot} animate-pulse`} />
                    {item.status === 'verde' ? 'Saudável' : item.status === 'amarelo' ? 'Atenção' : 'Crítico'}
                  </span>
                </div>

                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-ink">
                    {item.valorFormatado}
                  </span>
                </div>

                <p className="mt-2 text-xs font-medium leading-relaxed text-ink/80">
                  {item.diagnostico}
                </p>
              </div>

              <div className="mt-4 border-t border-line/60 pt-2.5 text-[11px] text-ink-soft">
                <p className="truncate font-mono" title={item.detalheTecnico}>
                  {item.detalheTecnico}
                </p>
                <p className="mt-1 font-sans text-[10px] text-ink-soft/70">
                  {item.metaRecomendada}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
