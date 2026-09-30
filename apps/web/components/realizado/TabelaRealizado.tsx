'use client'
import type { CampoRealizado, RealizadoMensal } from '@sf/engine'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CATALOGO_REALIZADO, GRUPOS_REALIZADO, rotuloCompetencia } from '@/lib/realizadoCatalogo'
import { Badge, Card } from '../ui'
import { CelulaRealizado } from './CelulaRealizado'

export function TabelaRealizado({ empresaId, meses }: { empresaId: string; meses: RealizadoMensal[] }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)

  async function patch(body: Record<string, unknown>) {
    setErro(null)
    const res = await fetch(`/api/empresas/${empresaId}/realizado`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErro(j.erro ?? (j.erros ?? []).join('; ') ?? `Falha (${res.status})`) }
    router.refresh()
  }
  const editar = (competencia: string, campo: CampoRealizado) => (valor: number | null) => patch({ competencia, campo, valor })
  const fechar = (m: RealizadoMensal) => patch({ competencia: m.competencia, fechado: !m.fechado })

  return (
    <Card className="p-0">
      {erro && <p className="border-b border-line bg-bad-soft px-4 py-2 text-sm text-bad">{erro}</p>}
      <div className="tabela-wrap">
        <table className="tabela num w-full text-sm">
          <thead>
            <tr>
              <th className="sticky-col text-left font-medium">Campo</th>
              {meses.map((m) => (
                <th key={m.competencia} className="text-right font-medium">
                  <div>{rotuloCompetencia(m.competencia)}</div>
                  <div className="mt-0.5 flex items-center justify-end gap-1">
                    <Badge tone={m.status === 'ok' ? 'ok' : m.status === 'parcial' ? 'warn' : 'neutral'}>{m.status}</Badge>
                    <button
                      type="button" onClick={() => fechar(m)}
                      title={m.fechado ? 'Mês fechado: a sincronização não altera. Clique para reabrir.' : 'Fechar o mês (congela os valores)'}
                      className={`rounded px-1 text-xs ${m.fechado ? 'bg-ink text-white' : 'text-ink-soft hover:bg-paper'}`}
                      aria-label={m.fechado ? 'reabrir mês' : 'fechar mês'}
                    >{m.fechado ? '🔒' : '🔓'}</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRUPOS_REALIZADO.map((g) => (
              <Grupo key={g} nome={g} meses={meses} editar={editar} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-line px-4 py-2 text-xs text-ink-soft">
        <span><span className="rounded bg-warn-soft px-1 text-warn">sem fonte</span> o sistema não tem esse dado</span>
        <span><span className="rounded bg-warn-soft px-1 text-warn">sem dados</span> a fonte existe, mas o mês veio vazio</span>
        <span><span className="rounded bg-warn-soft px-1 text-warn">parcial</span> estimativa ou foto na sincronização (passe o mouse)</span>
        <span><span className="rounded bg-brand-soft px-1 text-brand-dark">manual</span> digitado aqui; vence a sincronização</span>
      </div>
    </Card>
  )
}

function Grupo({ nome, meses, editar }: { nome: string; meses: RealizadoMensal[]; editar: (c: string, k: CampoRealizado) => (v: number | null) => Promise<void> }) {
  const itens = CATALOGO_REALIZADO.filter((i) => i.grupo === nome)
  return (
    <>
      <tr className="linha-total">
        <td className="sticky-col text-xs font-semibold uppercase tracking-wide text-ink-soft" colSpan={meses.length + 1}>{nome}</td>
      </tr>
      {itens.map((it) => (
        <tr key={it.chave}>
          <td className="sticky-col" title={it.ajuda}>{it.rotulo}</td>
          {meses.map((m) => (
            <td key={m.competencia} className="p-0.5">
              <CelulaRealizado valor={m.valores[it.chave]} prov={m.campos[it.chave]} unidade={it.unidade} fechado={m.fechado} onCommit={editar(m.competencia, it.chave)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
