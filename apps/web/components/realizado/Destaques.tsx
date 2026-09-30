import type { ResumoMes } from '@/lib/realizadoResumo'
import { rotuloCompetencia } from '@/lib/realizadoCatalogo'
import { Card } from '../ui'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function Kpi({ rotulo, valor, comparar, negativoRuim }: { rotulo: string; valor: string; comparar?: { atual: number; antes: number | null }; negativoRuim?: boolean }) {
  const delta = comparar && comparar.antes ? (comparar.atual - comparar.antes) / Math.abs(comparar.antes) : null
  return (
    <Card className="p-3">
      <div className="text-xs text-ink-soft">{rotulo}</div>
      <div className={`num text-xl font-semibold ${negativoRuim && comparar && comparar.atual < 0 ? 'text-bad' : ''}`}>{valor}</div>
      {delta !== null && <div className="text-xs text-ink-soft">{delta >= 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(0)}% vs mês anterior</div>}
    </Card>
  )
}

/** Faixa de números do último mês com dados — a leitura rápida antes da tabela. */
export function Destaques({ atual, anterior }: { atual: ResumoMes | null; anterior: ResumoMes | null }) {
  if (!atual) return null
  return (
    <section aria-label={`Destaques de ${rotuloCompetencia(atual.competencia)}`}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Destaques · {rotuloCompetencia(atual.competencia)}</div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Receita bruta" valor={brl(atual.receita)} comparar={{ atual: atual.receita, antes: anterior?.receita ?? null }} />
        <Kpi rotulo="Resultado (aprox.)" valor={brl(atual.resultado)} comparar={{ atual: atual.resultado, antes: anterior?.resultado ?? null }} negativoRuim />
        <Kpi rotulo="Caixa e bancos" valor={atual.caixa != null ? brl(atual.caixa) : '—'} />
        <Kpi rotulo="Pedidos / atendimentos" valor={atual.pedidos != null ? atual.pedidos.toLocaleString('pt-BR') : '—'} comparar={atual.pedidos != null ? { atual: atual.pedidos, antes: anterior?.pedidos ?? null } : undefined} />
      </div>
    </section>
  )
}
