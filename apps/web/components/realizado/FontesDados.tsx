'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { FonteDados } from '@/lib/db/repo'
import { ROTULO_FONTE } from '@/lib/realizadoCatalogo'
import { Badge, Button, Card, Select, TextInput } from '../ui'

type Tipo = 'pdv' | 'clinica' | 'rh'
type Linha = { tipo: Tipo; ativo: boolean; chave: string; rotulo: string }
const CHAVE: Record<Tipo, { campo: string; rotulo: string; ajuda: string }> = {
  pdv: { campo: 'unit_id', rotulo: 'unit_id da unidade no PDV', ajuda: 'uuid em fa_kiosk_units' },
  clinica: { campo: 'clinic_id', rotulo: 'clinic_id no sistema da Clínica', ajuda: 'uuid em clinics (projeto da clínica)' },
  rh: { campo: 'unit_id', rotulo: 'id da unidade no RH', ajuda: 'slug em units, ex.: clinica-a' },
}

export function FontesDados({ empresaId, fontes }: { empresaId: string; fontes: FonteDados[] }) {
  const router = useRouter()
  const [linhas, setLinhas] = useState<Linha[]>(fontes.map((f) => ({ tipo: f.tipo, ativo: f.ativo, chave: f.config[CHAVE[f.tipo].campo] ?? '', rotulo: f.rotulo ?? '' })))
  const [msg, setMsg] = useState<{ tom: 'ok' | 'bad'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const livres = (['pdv', 'clinica', 'rh'] as Tipo[]).filter((t) => !linhas.some((l) => l.tipo === t))

  async function salvar() {
    setOcupado(true); setMsg(null)
    const body = linhas.map((l) => ({ tipo: l.tipo, ativo: l.ativo, rotulo: l.rotulo || null, config: { [CHAVE[l.tipo].campo]: l.chave.trim() } }))
    const res = await fetch(`/api/empresas/${empresaId}/fontes`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    setOcupado(false)
    if (!res.ok) { setMsg({ tom: 'bad', texto: (j.erros ?? [j.erro ?? `Falha (${res.status})`]).join('; ') }); return }
    setMsg({ tom: 'ok', texto: 'Fontes salvas.' })
    router.refresh()
  }
  const upd = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))

  return (
    <Card className="p-4">
      <details open={fontes.length === 0}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold">
          Fontes de dados
          {fontes.map((f) => <Badge key={f.id} tone={f.ativo ? 'info' : 'neutral'}>{ROTULO_FONTE[f.tipo]}{f.ativo ? '' : ' (inativa)'}</Badge>)}
          {fontes.length === 0 && <Badge tone="warn">nenhuma fonte — esta empresa não é alimentada</Badge>}
        </summary>
        <p className="mt-2 text-xs text-ink-soft">Uma fonte por tipo. O PDV e o RH podem coexistir (o RH sobrescreve a folha quando tem o documento do contador).</p>
        <div className="mt-3 space-y-2">
          {linhas.map((l, i) => (
            <div key={l.tipo} className="grid items-end gap-2 rounded-md border border-line p-3 sm:grid-cols-[10rem_1fr_1fr_auto_auto]">
              <div className="text-sm font-medium">{ROTULO_FONTE[l.tipo]}</div>
              <label className="flex flex-col gap-1 text-xs text-ink-soft">{CHAVE[l.tipo].rotulo}
                <TextInput value={l.chave} onChange={(v) => upd(i, { chave: v })} placeholder={CHAVE[l.tipo].ajuda} className="w-full" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-soft">Rótulo
                <TextInput value={l.rotulo} onChange={(v) => upd(i, { rotulo: v })} className="w-full" />
              </label>
              <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" checked={l.ativo} onChange={(e) => upd(i, { ativo: e.target.checked })} /> ativa</label>
              <Button variant="danger" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>Remover</Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {livres.length > 0 && (
            <Select value="" onChange={(t) => { if (t) setLinhas((ls) => [...ls, { tipo: t as Tipo, ativo: true, chave: '', rotulo: '' }]) }}
              options={[{ value: '', label: '+ adicionar fonte…' }, ...livres.map((t) => ({ value: t, label: ROTULO_FONTE[t] }))]} />
          )}
          <Button onClick={salvar} disabled={ocupado}>Salvar fontes</Button>
          {msg && <Badge tone={msg.tom}>{msg.texto}</Badge>}
        </div>
      </details>
    </Card>
  )
}
