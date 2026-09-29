'use client'
import { useState } from 'react'
import type { EmpresaRow } from '@/lib/db/repo'
import { EmpresaForm } from './EmpresaForm'
import { Badge, Button, Card } from './ui'

const PORTE: Record<string, string> = { mei: 'MEI', micro: 'Microempresa', pequena: 'Pequena', media: 'Média', grande: 'Grande' }

export function CadastroEmpresa({ empresa: e }: { empresa: EmpresaRow }) {
  const [editando, setEditando] = useState(false)
  if (editando)
    return (
      <EmpresaForm
        onCancel={() => setEditando(false)}
        inicial={{
          id: e.id, razaoSocial: e.razaoSocial, cnpj: e.cnpj ?? '', segmento: e.segmento ?? 'outro', regime: e.regimeTributario,
          atividadePresumido: e.atividadePresumido ?? 'comercio_industria', uf: e.uf ?? '', cidade: e.cidade ?? '',
          anoInicio: e.anoInicio ? String(e.anoInicio) : '', nomeFantasia: e.nomeFantasia ?? '', porte: (e.porte ?? '') as never,
          responsavel: e.responsavel ?? '', emailContato: e.emailContato ?? '', telefone: e.telefone ?? '', site: e.site ?? '',
          descricaoAtividade: e.descricaoAtividade ?? '', consentimento: !!e.consentimentoEm,
        }}
      />
    )
  const itens: [string, string | null][] = [
    ['Nome fantasia', e.nomeFantasia], ['CNPJ', e.cnpj], ['Segmento', e.segmento], ['Porte', e.porte ? PORTE[e.porte] : null],
    ['Local', [e.cidade, e.uf].filter(Boolean).join(' / ') || null], ['Início', e.anoInicio ? String(e.anoInicio) : null],
    ['Responsável', e.responsavel], ['E-mail', e.emailContato], ['Telefone', e.telefone], ['Site', e.site],
  ]
  const faltam = itens.filter(([, v]) => !v).length
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Cadastro</h2>
        <div className="flex items-center gap-2">
          {e.consentimentoEm ? <Badge tone="ok">✓ Autorização LGPD registrada</Badge> : <Badge tone="warn">Sem autorização LGPD registrada</Badge>}
          {faltam > 0 && <Badge tone="neutral">{faltam} campo(s) em branco</Badge>}
          <Button variant="ghost" onClick={() => setEditando(true)}>Editar cadastro</Button>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-5">
        {itens.map(([k, v]) => (
          <div key={k}><dt className="text-xs text-ink-soft">{k}</dt><dd>{v || <span className="text-ink-soft">—</span>}</dd></div>
        ))}
      </dl>
      {e.descricaoAtividade && <p className="mt-3 text-sm text-ink-soft">{e.descricaoAtividade}</p>}
    </Card>
  )
}
