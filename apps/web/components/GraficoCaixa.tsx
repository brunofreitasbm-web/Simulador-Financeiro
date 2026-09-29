'use client'
import type { Resultado } from '@sf/engine'
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatarBRL } from '@sf/engine'

const CORES = ['#0f6b62', '#c0392b', '#2b6cb0', '#b7791f', '#6b46c1', '#2d3748']

/** Linha do caixa mês a mês; região negativa em vermelho. Aceita vários cenários sobrepostos. */
export function GraficoCaixa({ series, altura = 280 }: { series: { nome: string; r: Resultado }[]; altura?: number }) {
  if (series.length === 0) return null
  const n = series[0].r.meses.length
  const dados = Array.from({ length: n }, (_, i) => {
    const [a, m] = series[0].r.meses[i].competencia.split('-')
    const p: Record<string, number | string> = { mes: `${m}/${a.slice(2)}` }
    for (const s of series) p[s.nome] = Math.round(s.r.meses[i].bp.caixa)
    return p
  })
  const min = Math.min(0, ...dados.flatMap((d) => series.map((s) => d[s.nome] as number)))
  return (
    <div style={{ height: altura }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5eaee" />
          <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={56} />
          {min < 0 && <ReferenceArea y1={min * 1.1} y2={0} fill="#c0392b" fillOpacity={0.08} />}
          <ReferenceLine y={0} stroke="#c0392b" strokeDasharray="4 2" />
          <Tooltip formatter={(v) => formatarBRL(Number(v), 0)} />
          {series.length > 1 && <Legend />}
          {series.map((s, i) => <Line key={s.nome} type="monotone" dataKey={s.nome} stroke={CORES[i % CORES.length]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
