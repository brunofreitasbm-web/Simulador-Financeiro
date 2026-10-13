'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { FonteDados, TipoFonte } from '@/lib/db/repo'
import { ROTULO_FONTE } from '@/lib/realizadoCatalogo'
import { Badge, Button, Card, Select, TextInput } from '../ui'

/**
 * Fontes de dados da empresa. `pdv`, `clinica` e `rh` são únicas por empresa; `github` pode
 * repetir, porque cada repositório publica o seu próprio fechamento (o Playground recebe o PDV de
 * `faca_amigos` e a folha de `controle-de-estagiario`).
 */
type Campo = { id: string; rotulo: string; ajuda: string }
const CAMPOS: Record<TipoFonte, Campo[]> = {
  pdv: [{ id: 'unit_id', rotulo: 'unit_id da unidade no PDV', ajuda: 'uuid em fa_kiosk_units' }],
  clinica: [{ id: 'clinic_id', rotulo: 'clinic_id no sistema da Clínica', ajuda: 'uuid em clinics (projeto da clínica)' }],
  rh: [{ id: 'unit_id', rotulo: 'id da unidade no RH', ajuda: 'slug em units, ex.: clinica-a' }],
  github: [
    { id: 'repo', rotulo: 'Repositório', ajuda: 'owner/nome, ex.: brunofreitasbm-web/faca_amigos' },
    { id: 'unidade', rotulo: 'Unidade no fechamento', ajuda: 'casa com unidades[].chave (ou o rótulo) do fechamento/AAAA-MM.json' },
    { id: 'branch', rotulo: 'Branch (opcional)', ajuda: 'padrão: main' },
  ],
}
const UNICOS: TipoFonte[] = ['pdv', 'clinica', 'rh']

type Linha = { tipo: TipoFonte; ativo: boolean; campos: Record<string, string>; rotulo: string }
const linhaDe = (f: FonteDados): Linha => ({
  tipo: f.tipo, ativo: f.ativo, rotulo: f.rotulo ?? '',
  campos: Object.fromEntries(CAMPOS[f.tipo].map((c) => [c.id, f.config[c.id] ?? ''])),
})

/** Só os campos preenchidos entram no config — assim `branch` vazio não vira string vazia no banco. */
const configDe = (l: Linha) => Object.fromEntries(
  CAMPOS[l.tipo].map((c) => [c.id, (l.campos[c.id] ?? '').trim()]).filter(([, v]) => v !== ''),
) as Record<string, string>

export function FontesDados({ empresaId, fontes }: { empresaId: string; fontes: FonteDados[] }) {
  const router = useRouter()
  const [linhas, setLinhas] = useState<Linha[]>(fontes.map(linhaDe))
  const [msg, setMsg] = useState<{ tom: 'ok' | 'bad'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const livres = UNICOS.filter((t) => !linhas.some((l) => l.tipo === t))
  const adicionaveis: TipoFonte[] = [...livres, 'github']

  async function salvar() {
    setOcupado(true); setMsg(null)
    const body = linhas.map((l) => ({ tipo: l.tipo, ativo: l.ativo, rotulo: l.rotulo || null, config: configDe(l) }))
    const res = await fetch(`/api/empresas/${empresaId}/fontes`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    setOcupado(false)
    if (!res.ok) { setMsg({ tom: 'bad', texto: (j.erros ?? [j.erro ?? `Falha (${res.status})`]).join('; ') }); return }
    setMsg({ tom: 'ok', texto: 'Fontes salvas.' })
    router.refresh()
  }
  const upd = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const updCampo = (i: number, id: string, v: string) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, campos: { ...l.campos, [id]: v } } : l)))

  return (
    <Card className="p-4">
      <details open={fontes.length === 0}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold">
          Fontes de dados
          {fontes.map((f) => <Badge key={f.id} tone={f.ativo ? 'info' : 'neutral'}>{ROTULO_FONTE[f.tipo]}{f.ativo ? '' : ' (inativa)'}</Badge>)}
          {fontes.length === 0 && <Badge tone="warn">nenhuma fonte — esta empresa não é alimentada</Badge>}
        </summary>
        <p className="mt-2 text-xs text-ink-soft">
          O PDV e o RH podem coexistir (o RH sobrescreve a folha quando tem o documento do contador).
          A fonte <strong>GitHub</strong> lê o <code>fechamento/AAAA-MM.json</code> publicado no repositório
          e pode repetir: um repositório por fonte. Ela grava antes das fontes ao vivo, então preenche o
          que elas não alcançam e nunca sobrescreve valor digitado à mão nem mês fechado.
        </p>
        <div className="mt-3 space-y-2">
          {linhas.map((l, i) => (
            <div key={`${l.tipo}-${i}`} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">{ROTULO_FONTE[l.tipo]}</div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={l.ativo} onChange={(e) => upd(i, { ativo: e.target.checked })} /> ativa
                  </label>
                  <Button variant="danger" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>Remover</Button>
                </div>
              </div>
              <div className="mt-2 grid items-end gap-2 sm:grid-cols-2">
                {CAMPOS[l.tipo].map((c) => (
                  <label key={c.id} className="flex flex-col gap-1 text-xs text-ink-soft">
                    {c.rotulo}
                    <TextInput value={l.campos[c.id] ?? ''} onChange={(v) => updCampo(i, c.id, v)} placeholder={c.ajuda} className="w-full" />
                  </label>
                ))}
                <label className="flex flex-col gap-1 text-xs text-ink-soft">
                  Rótulo
                  <TextInput value={l.rotulo} onChange={(v) => upd(i, { rotulo: v })} className="w-full" />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {adicionaveis.length > 0 && (
            <Select value="" onChange={(t) => {
              if (!t) return
              setLinhas((ls) => [...ls, { tipo: t as TipoFonte, ativo: true, rotulo: '', campos: {} }])
            }}
              options={[{ value: '', label: '+ adicionar fonte…' }, ...adicionaveis.map((t) => ({ value: t, label: ROTULO_FONTE[t] }))]} />
          )}
          <Button onClick={salvar} disabled={ocupado}>Salvar fontes</Button>
          {msg && <Badge tone={msg.tom}>{msg.texto}</Badge>}
        </div>
      </details>
    </Card>
  )
}
