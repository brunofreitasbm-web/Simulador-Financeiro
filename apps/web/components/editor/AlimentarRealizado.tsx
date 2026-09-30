'use client'
import { montarPremissasDeRealizado, type Alimentacao, type RealizadoMensal } from '@sf/engine'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { aplicarAlimentacao } from '@/lib/alimentacao'
import { ROTULOS } from '@/lib/rotulos'
import { rotuloCompetencia } from '@/lib/realizadoCatalogo'
import type { Rascunho } from '@/lib/rascunho'
import { Badge, Button, Card } from '../ui'

interface Props { empresaId: string; r: Rascunho; setR: (f: (x: Rascunho) => Rascunho) => void; fechar: () => void }

const rot = (campo: string) => ROTULOS[campo] ?? campo

/** Painel "Alimentar com realizado": lê os 12 meses reais até a data-base, mostra o que dá para preencher e aplica. */
export function AlimentarRealizado({ empresaId, r, setR, fechar }: Props) {
  const [meses, setMeses] = useState<RealizadoMensal[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sobrescrever, setSobrescrever] = useState(false)
  const [feito, setFeito] = useState<{ aplicados: string[]; mantidos: string[] } | null>(null)
  const ate = r.dataBase.slice(0, 7)

  useEffect(() => {
    let vivo = true
    setMeses(null); setErro(null); setFeito(null)
    fetch(`/api/empresas/${empresaId}/realizado?ate=${ate}&meses=12`)
      .then(async (res) => { if (!res.ok) throw new Error((await res.json().catch(() => ({}))).erro ?? `Falha (${res.status})`); return res.json() })
      .then((j: { meses: RealizadoMensal[] }) => { if (vivo) setMeses(j.meses) })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'erro') })
    return () => { vivo = false }
  }, [empresaId, ate])

  const a: Alimentacao | null = meses ? montarPremissasDeRealizado(meses, r.dataBase) : null
  const disponiveis = a ? [...Object.keys(a.historico).map((k) => `historico.${k}`), ...Object.keys(a.abertura).map((k) => `abertura.${k}`), ...(a.projecao.sazonalidade ? ['projecao.sazonalidade'] : [])] : []
  const bloqueantes = a?.lacunas.filter((l) => l.nivel === 'bloqueante') ?? []
  const avisos = a?.lacunas.filter((l) => l.nivel === 'aviso') ?? []
  const comDados = meses?.filter((m) => m.status !== 'vazio').length ?? 0

  function aplicar() {
    if (!a) return
    let res: { aplicados: string[]; mantidos: string[] } = { aplicados: [], mantidos: [] }
    setR((x) => { const out = aplicarAlimentacao(x, a, sobrescrever); res = { aplicados: out.aplicados, mantidos: out.mantidos }; return out.rascunho })
    setFeito(res)
  }
  function usarUltimoMesFechado() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))
    setR((x) => ({ ...x, dataBase: fim.toISOString().slice(0, 10) }))
  }

  return (
    <Card className="border-brand/30 bg-brand-soft/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Alimentar com realizado</h3>
        <div className="flex items-center gap-2">
          <Link href={`/empresas/${empresaId}/realizado`} className="text-sm text-brand-dark hover:underline">abrir painel Realizado</Link>
          <Button variant="ghost" onClick={fechar}>Fechar</Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Janela: 12 meses até {rotuloCompetencia(ate)} (mês da data-base). {meses ? `${comDados} de 12 meses com dados.` : ''}
        <button className="ml-2 text-brand-dark underline-offset-2 hover:underline" onClick={usarUltimoMesFechado}>usar o último mês fechado como data-base</button>
      </p>
      {erro && <p className="mt-2 text-sm text-bad">{erro}</p>}
      {!meses && !erro && <p className="mt-2 text-sm text-ink-soft">Carregando…</p>}
      {a && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Preenchíveis ({disponiveis.length})</div>
            {disponiveis.length === 0 && <p className="text-sm text-ink-soft">Nada a preencher: os meses da janela não têm dados suficientes.</p>}
            <ul className="flex flex-wrap gap-1">{disponiveis.map((c) => <li key={c}><Badge tone="info">{rot(c)}</Badge></li>)}</ul>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Sem fonte no realizado ({bloqueantes.length})</div>
            {bloqueantes.length === 0 && <p className="text-sm text-ok">Todos os campos deriváveis têm dados.</p>}
            <ul className="space-y-0.5 text-sm">
              {bloqueantes.map((l) => <li key={l.campo}><Badge tone="warn">{rot(l.campo)}</Badge> <span className="text-ink-soft">{l.motivo}</span></li>)}
            </ul>
            {avisos.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-ink-soft">
                {avisos.map((l, i) => <li key={`${l.campo}-${i}`}>ⓘ {rot(l.campo)}: {l.motivo}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
      {a && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} /> sobrescrever valores já digitados</label>
          <Button onClick={aplicar} disabled={disponiveis.length === 0}>Aplicar à simulação</Button>
          {feito && <Badge tone="ok">{feito.aplicados.length} campo(s) preenchido(s){feito.mantidos.length ? `, ${feito.mantidos.length} mantido(s) como estavam` : ''}</Badge>}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-soft">Prazos (recebimento, pagamento a fornecedores, cartão) e capital social não vêm do realizado: continuam digitados. Campos preenchidos ficam marcados com ↓.</p>
    </Card>
  )
}
