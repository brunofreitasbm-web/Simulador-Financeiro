'use client'
import Link from 'next/link'
import { useState } from 'react'

/** Barra lateral: lista de empresas; o clique troca o quadro da direita sem voltar ao início. */
export function MenuEmpresas({ atual, empresas, meses }: { atual: string; empresas: { id: string; nome: string }[]; meses: number }) {
  const [busca, setBusca] = useState('')
  const filtradas = empresas.filter((e) => e.nome.toLowerCase().includes(busca.toLowerCase()))
  return (
    <aside className="no-print lg:sticky lg:top-20 lg:self-start" aria-label="Empresas">
      <div className="rounded-lg border border-line bg-card p-2">
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Empresas ({empresas.length})</span>
          <Link href="/empresas" className="text-xs text-ink-soft hover:text-ink">← Início</Link>
        </div>
        {empresas.length > 8 && (
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empresa"
            aria-label="Buscar empresa"
            className="mb-2 min-h-9 w-full rounded-md border border-line bg-white px-2 py-1 text-sm"
          />
        )}
        <nav className="flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto">
          {filtradas.map((e) => {
            const ativa = e.id === atual
            return (
              <Link
                key={e.id}
                href={`/empresas/${e.id}/realizado${meses === 24 ? '?meses=24' : ''}`}
                aria-current={ativa ? 'page' : undefined}
                className={`min-h-9 rounded-md px-2 py-1.5 text-sm ${ativa ? 'bg-brand-soft font-semibold text-brand-dark' : 'text-ink hover:bg-paper'}`}
              >
                {e.nome}
              </Link>
            )
          })}
          {filtradas.length === 0 && <p className="px-2 py-1 text-sm text-ink-soft">Nenhuma empresa.</p>}
        </nav>
      </div>
    </aside>
  )
}
