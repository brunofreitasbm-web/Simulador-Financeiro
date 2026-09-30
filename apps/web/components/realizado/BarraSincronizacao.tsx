'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Sincronizacao } from '@/lib/db/repo'
import { competenciaAtual, rotuloCompetencia } from '@/lib/realizadoCatalogo'
import { Badge, Button, Card } from '../ui'

const TOM: Record<Sincronizacao['status'], 'ok' | 'warn' | 'bad' | 'info'> = { ok: 'ok', parcial: 'warn', erro: 'bad', executando: 'info' }

export function BarraSincronizacao({ empresaId, sincronizacoes, temFontes }: { empresaId: string; sincronizacoes: Sincronizacao[]; temFontes: boolean }) {
  const router = useRouter()
  const [competencia, setCompetencia] = useState(competenciaAtual(-1))
  const [sobrescrever, setSobrescrever] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'ok' | 'bad' | 'warn'; texto: string } | null>(null)
  const [aberto, setAberto] = useState(false)

  async function sincronizar() {
    setOcupado(true); setMsg(null)
    try {
      const res = await fetch(`/api/empresas/${empresaId}/sincronizar`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ competencias: [competencia], sobrescrever }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setMsg({ tom: 'bad', texto: j.erro ?? `Falha (${res.status})` })
      else setMsg({ tom: j.status === 'ok' ? 'ok' : 'warn', texto: j.status === 'ok' ? `Sincronizado ${rotuloCompetencia(competencia)}.` : `Sincronização ${j.status}: veja o histórico abaixo.` })
      router.refresh()
    } catch (e) {
      setMsg({ tom: 'bad', texto: e instanceof Error ? e.message : 'erro de rede' })
    } finally { setOcupado(false) }
  }

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-soft">Mês</span>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} max={competenciaAtual()} className="rounded-md border border-line bg-white px-2 py-1.5 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm" title="Substitui também as células digitadas à mão e os meses fechados">
          <input type="checkbox" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} /> sobrescrever manuais
        </label>
        <Button onClick={sincronizar} disabled={ocupado || !temFontes || !/^\d{4}-\d{2}$/.test(competencia)}>{ocupado ? 'Sincronizando…' : 'Sincronizar agora'}</Button>
        {!temFontes && <span className="text-sm text-warn">Cadastre uma fonte de dados abaixo para sincronizar.</span>}
        {msg && <Badge tone={msg.tom}>{msg.texto}</Badge>}
        <button className="ml-auto text-sm text-ink-soft underline-offset-2 hover:underline" onClick={() => setAberto((x) => !x)}>
          {aberto ? 'ocultar histórico' : `histórico (${sincronizacoes.length})`}
        </button>
      </div>
      {aberto && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {sincronizacoes.length === 0 && <li className="py-2 text-ink-soft">Nenhuma sincronização ainda.</li>}
          {sincronizacoes.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
              <Badge tone={TOM[s.status]}>{s.status}</Badge>
              <span className="text-ink-soft">{new Date(s.iniciadoEm).toLocaleString('pt-BR')}</span>
              <span>{s.origem === 'cron' ? 'escuta automática' : `manual (${s.disparadoPor ?? '—'})`}</span>
              <span className="text-ink-soft">{s.competencias.map(rotuloCompetencia).join(', ')}</span>
              {s.erro && <span className="text-bad">{s.erro}</span>}
              <Erros resultado={s.resultado} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Extrai as mensagens de erro por fonte/competência do JSON de resultado. */
function Erros({ resultado }: { resultado: Record<string, unknown> }) {
  const linhas: string[] = []
  for (const emp of Object.values(resultado) as { nome?: string; fontes?: Record<string, Record<string, { ok: boolean; erro?: string }>> }[]) {
    for (const [fonte, comps] of Object.entries(emp.fontes ?? {})) {
      for (const [comp, r] of Object.entries(comps)) if (!r.ok) linhas.push(`${emp.nome ?? ''} · ${fonte} · ${rotuloCompetencia(comp)}: ${r.erro ?? 'erro'}`)
    }
  }
  if (!linhas.length) return null
  return <ul className="w-full list-disc pl-6 text-xs text-bad">{linhas.map((l) => <li key={l}>{l}</li>)}</ul>
}
