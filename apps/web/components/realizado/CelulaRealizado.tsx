'use client'
import { formatarBRL, type ProvenienciaCampo } from '@sf/engine'
import { useEffect, useRef, useState } from 'react'
import { ROTULO_FONTE, ROTULO_STATUS_CAMPO } from '@/lib/realizadoCatalogo'

interface Props {
  valor: number | null | undefined
  prov: ProvenienciaCampo | undefined
  unidade: 'R$' | 'un'
  fechado: boolean
  onCommit: (valor: number | null) => Promise<void>
}

const parse = (s: string): number | null | undefined => {
  const t = s.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/** Célula do painel: mostra valor + estado (sincronizado, manual, estimado, parcial, sem dados, sem fonte); clique edita. */
export function CelulaRealizado({ valor, prov, unidade, fechado, onCommit }: Props) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState('')
  const [salvando, setSalvando] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editando) ref.current?.focus() }, [editando])

  const status = prov?.status ?? (valor == null ? 'sem_dados' : 'ok')
  const tem = typeof valor === 'number'
  const titulo = [prov ? `${ROTULO_STATUS_CAMPO[status]} · ${ROTULO_FONTE[prov.fonte] ?? prov.fonte}` : 'sem informação', prov?.obs, prov?.atualizadoEm ? `atualizado ${new Date(prov.atualizadoEm).toLocaleString('pt-BR')}` : null]
    .filter(Boolean).join('\n')

  async function commit() {
    const v = parse(txt)
    setEditando(false)
    if (v === undefined) return
    if (v === (valor ?? null)) return
    setSalvando(true)
    try { await onCommit(v) } finally { setSalvando(false) }
  }

  if (editando) {
    return (
      <input
        ref={ref} inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditando(false) }}
        className="num w-28 rounded border border-brand bg-white px-1 py-0.5 text-right text-sm outline-none"
        aria-label="valor"
      />
    )
  }

  const fundo = status === 'manual' ? 'bg-brand-soft/60' : status === 'estimado' ? 'bg-brand-soft/25 ring-1 ring-inset ring-brand/30' : status === 'parcial' ? 'bg-warn-soft/60' : !tem ? 'bg-warn-soft/40' : ''
  const texto = !tem ? '—' : unidade === 'R$' ? formatarBRL(valor, 0) : valor.toLocaleString('pt-BR')
  const selo = status === 'ok' && tem ? null : status
  return (
    <button
      type="button" title={titulo} disabled={salvando || fechado}
      onClick={() => { setTxt(tem ? String(valor).replace('.', ',') : ''); setEditando(true) }}
      className={`num flex w-full min-w-[7rem] items-center justify-end gap-1 rounded px-1 py-0.5 text-right text-sm hover:ring-1 hover:ring-brand disabled:cursor-default disabled:hover:ring-0 ${fundo} ${!tem ? 'text-ink-soft' : ''}`}
    >
      {selo && (
        <span className={`rounded px-1 text-[10px] font-medium ${status === 'manual' || status === 'estimado' ? 'bg-brand-soft text-brand-dark' : 'bg-warn-soft text-warn'}`}>
          {ROTULO_STATUS_CAMPO[status]}
        </span>
      )}
      <span>{salvando ? '…' : texto}</span>
    </button>
  )
}
