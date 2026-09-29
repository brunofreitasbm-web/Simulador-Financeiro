'use client'
import { REGISTRY, type IndicadorId, type Resultado } from '@sf/engine'
import { fmtInd, GRUPOS_IND } from '@/lib/indicadoresGrupos'
import { GraficoCaixa } from './GraficoCaixa'
import { formatar, type Fmt } from './Tabela'
import { Card } from './ui'

const DRE_LINHAS = ['rb', 'rl', 'mc', 'ebitda', 'ebit', 'll', 'resultadoApos'] as const

export function Comparar({ cenarios }: { cenarios: { nome: string; r: Resultado }[] }) {
  if (cenarios.length === 0) return null
  const th = 'px-3 py-2 text-right font-medium'
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="mb-2 font-semibold">Caixa mês a mês</h3>
        <GraficoCaixa series={cenarios} />
      </Card>
      <Card className="overflow-x-auto">
        <table className="tabela num w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-xs text-ink-soft">
              <th className="px-3 py-2 text-left font-medium">DRE anual</th>
              {cenarios.map((c) => <th key={c.nome} className={th}>{c.nome}</th>)}
            </tr>
          </thead>
          <tbody>
            {DRE_LINHAS.map((k) => (
              <tr key={k}>
                <td className="text-left" title={REGISTRY.dre[k].glossario}>{REGISTRY.dre[k].rotulo}</td>
                {cenarios.map((c) => <td key={c.nome} className={`text-right ${c.r.anual.dre[k] < 0 ? 'text-bad' : ''}`}>{formatar(c.r.anual.dre[k], 'brl')}</td>)}
              </tr>
            ))}
            <tr>
              <td className="text-left font-medium">Caixa final</td>
              {cenarios.map((c) => {
                const v = c.r.meses[c.r.meses.length - 1].bp.caixa
                return <td key={c.nome} className={`text-right font-medium ${v < 0 ? 'text-bad' : ''}`}>{formatar(v, 'brl')}</td>
              })}
            </tr>
            {GRUPOS_IND.map((gp) => (
              <RowsGrupo key={gp.titulo} titulo={gp.titulo} ids={gp.ids} cenarios={cenarios} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function RowsGrupo({ titulo, ids, cenarios }: { titulo: string; ids: IndicadorId[]; cenarios: { nome: string; r: Resultado }[] }) {
  return (
    <>
      <tr className="bg-brand-soft"><td colSpan={cenarios.length + 1} className="text-xs font-semibold uppercase tracking-wide text-brand-dark">{titulo}</td></tr>
      {ids.map((id) => (
        <tr key={id}>
          <td className="text-left" title={`${REGISTRY.indicadores[id].glossario}\nFórmula: ${REGISTRY.indicadores[id].formulaLegivel}`}>{REGISTRY.indicadores[id].rotulo}</td>
          {cenarios.map((c) => <td key={c.nome} className="text-right">{formatar(c.r.indicadores.anual[id], fmtInd(id) as Fmt)}</td>)}
        </tr>
      ))}
    </>
  )
}
