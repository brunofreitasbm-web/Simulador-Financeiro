'use client'
import { formatarBRL } from '@sf/engine'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge, Button, Card } from './ui'

export interface SimulacaoLinha {
  id: string; nome: string; dataBase: string; updatedAt: string; caixaFinal: number | null; alertaCritico: string | null; erro: boolean
}

export function ListaSimulacoes({ empresaId, simulacoes }: { empresaId: string; simulacoes: SimulacaoLinha[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)

  async function nova() {
    setOcupado(true)
    const res = await fetch(`/api/empresas/${empresaId}/simulacoes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    const j = await res.json()
    router.push(`/simulacoes/${j.id}`)
  }
  async function duplicar(id: string) {
    setOcupado(true)
    await fetch(`/api/simulacoes/${id}/duplicar`, { method: 'POST' })
    setOcupado(false)
    router.refresh()
  }
  async function excluir(s: SimulacaoLinha) {
    if (!confirm(`Excluir a simulação "${s.nome}"?`)) return
    await fetch(`/api/simulacoes/${s.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Simulações</h2>
        <Button onClick={nova} disabled={ocupado}>Nova simulação</Button>
      </div>
      <Card className="divide-y divide-line">
        {simulacoes.length === 0 && <p className="p-4 text-sm text-ink-soft">Nenhuma simulação ainda. Crie a primeira para projetar os próximos 12 meses.</p>}
        {simulacoes.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
            <Link href={`/simulacoes/${s.id}`} className="min-w-0 flex-1">
              <div className="truncate font-medium text-brand-dark hover:underline">{s.nome}</div>
              <div className="text-xs text-ink-soft">Data-base {new Date(s.dataBase + 'T12:00:00').toLocaleDateString('pt-BR')} · atualizada {new Date(s.updatedAt).toLocaleString('pt-BR')}</div>
            </Link>
            {s.erro ? <Badge tone="neutral">dados incompletos</Badge> : (
              <>
                <div className="text-right">
                  <div className="text-xs text-ink-soft">Caixa projetado (mês 12)</div>
                  <div className={`num text-sm font-medium ${s.caixaFinal !== null && s.caixaFinal < 0 ? 'text-bad' : ''}`}>{formatarBRL(s.caixaFinal, 0)}</div>
                </div>
                {s.alertaCritico && <span title={s.alertaCritico}><Badge tone="bad">alerta crítico</Badge></span>}
              </>
            )}
            <Button variant="ghost" onClick={() => duplicar(s.id)} disabled={ocupado}>Duplicar</Button>
            <Button variant="danger" onClick={() => excluir(s)}>Excluir</Button>
          </div>
        ))}
      </Card>
    </div>
  )
}
