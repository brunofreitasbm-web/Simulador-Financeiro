'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Props {
  empresaId: string
  competenciaAtual: string
  competencias: string[]
  rotaBase: 'saude' | 'balanco' | 'dre'
}

export function SeletorPeriodo({ empresaId, competenciaAtual, competencias, rotaBase }: Props) {
  const router = useRouter()
  const idx = competencias.indexOf(competenciaAtual)
  const anterior = idx > 0 ? competencias[idx - 1] : null
  const proximo = idx >= 0 && idx < competencias.length - 1 ? competencias[idx + 1] : null

  const formataComp = (c: string) => {
    const [ano, mes] = c.split('-')
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const mNum = parseInt(mes, 10)
    return `${meses[mNum - 1] || mes}/${ano}`
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-2.5 shadow-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-ink-soft uppercase pl-1">Período:</span>

        {anterior ? (
          <Link
            href={`/empresas/${empresaId}/${rotaBase}?mes=${anterior}`}
            className="rounded border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-paper"
            title={`Ir para ${formataComp(anterior)}`}
          >
            ← {formataComp(anterior)}
          </Link>
        ) : (
          <span className="rounded border border-line/40 px-2 py-1 text-xs text-ink-soft/40 cursor-not-allowed">
            ←
          </span>
        )}

        <select
          value={competenciaAtual}
          onChange={(e) => {
            router.push(`/empresas/${empresaId}/${rotaBase}?mes=${e.target.value}`)
          }}
          className="rounded-md border border-brand bg-brand-soft/40 px-2.5 py-1 text-xs font-bold text-brand-dark outline-none cursor-pointer focus:ring-1 focus:ring-brand"
        >
          {competencias.map((c) => (
            <option key={c} value={c}>
              {formataComp(c)} {c === competenciaAtual ? '(Selecionado)' : ''}
            </option>
          ))}
        </select>

        {proximo ? (
          <Link
            href={`/empresas/${empresaId}/${rotaBase}?mes=${proximo}`}
            className="rounded border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-paper"
            title={`Ir para ${formataComp(proximo)}`}
          >
            {formataComp(proximo)} →
          </Link>
        ) : (
          <span className="rounded border border-line/40 px-2 py-1 text-xs text-ink-soft/40 cursor-not-allowed">
            →
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/empresas/${empresaId}/realizado`}
          className="text-xs text-brand hover:underline font-medium"
        >
          Ver histórico de 12/24 meses ➔
        </Link>
      </div>
    </div>
  )
}
