'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, Card, Field, Select, TextInput } from './ui'

const REGIMES = [
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'presumido', label: 'Lucro Presumido' },
  { value: 'real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
] as const

const SEGMENTOS = ['comércio', 'indústria', 'serviços', 'alimentação', 'saúde', 'outro']

export interface EmpresaDados {
  id?: string
  razaoSocial: string
  cnpj: string
  segmento: string
  regime: 'simples' | 'presumido' | 'real' | 'mei'
  atividadePresumido: 'comercio_industria' | 'servicos'
  uf: string
  cidade: string
  anoInicio: string
  nomeFantasia: string
  porte: '' | 'mei' | 'micro' | 'pequena' | 'media' | 'grande'
  responsavel: string
  emailContato: string
  telefone: string
  site: string
  descricaoAtividade: string
  consentimento: boolean
}

export function EmpresaForm({ inicial, onCancel }: { inicial?: EmpresaDados; onCancel?: () => void }) {
  const router = useRouter()
  const [d, setD] = useState<EmpresaDados>(inicial ?? {
    razaoSocial: '', cnpj: '', segmento: 'comércio', regime: 'simples', atividadePresumido: 'comercio_industria', uf: '', cidade: '',
    anoInicio: '', nomeFantasia: '', porte: '', responsavel: '', emailContato: '', telefone: '', site: '', descricaoAtividade: '', consentimento: false,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof EmpresaDados>(k: K, v: EmpresaDados[K]) => setD((x) => ({ ...x, [k]: v }))

  async function salvar() {
    setErro(null)
    if (d.cnpj && !cnpjValido(d.cnpj)) return setErro('CNPJ inválido (dígitos verificadores não conferem).')
    setSalvando(true)
    const body = {
      razaoSocial: d.razaoSocial.trim(), cnpj: d.cnpj.replace(/\D/g, '') || null, segmento: d.segmento || null, regime: d.regime,
      atividadePresumido: d.regime === 'presumido' ? d.atividadePresumido : null, uf: d.uf || null, cidade: d.cidade || null,
      anoInicio: d.anoInicio ? Number(d.anoInicio) : null, nomeFantasia: d.nomeFantasia, porte: d.porte, responsavel: d.responsavel,
      emailContato: d.emailContato, telefone: d.telefone, site: d.site, descricaoAtividade: d.descricaoAtividade,
      consentimento: d.consentimento && !inicial?.consentimento ? true : !d.consentimento && inicial?.consentimento ? false : undefined,
    }
    const res = await fetch(d.id ? `/api/empresas/${d.id}` : '/api/empresas', {
      method: d.id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    setSalvando(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      const msg = (j.erros as string[] | undefined)?.join('; ') ?? 'Não foi possível salvar.'
      return setErro(/unique|duplicate/i.test(msg) ? 'Já existe uma empresa com este CNPJ.' : msg)
    }
    onCancel?.()
    router.refresh()
  }

  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Razão social *" wide><TextInput className="w-full" value={d.razaoSocial} onChange={(v) => set('razaoSocial', v)} /></Field>
        <Field label="CNPJ"><TextInput className="w-full" value={d.cnpj} onChange={(v) => set('cnpj', v)} placeholder="00.000.000/0000-00" /></Field>
        <Field label="Segmento">
          <Select className="w-full" value={d.segmento} onChange={(v) => set('segmento', v)} options={SEGMENTOS.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Regime tributário *">
          <Select className="w-full" value={d.regime} onChange={(v) => set('regime', v)} options={[...REGIMES]} />
        </Field>
        {d.regime === 'presumido' && (
          <Field label="Atividade (para a presunção)">
            <Select className="w-full" value={d.atividadePresumido} onChange={(v) => set('atividadePresumido', v)}
              options={[{ value: 'comercio_industria', label: 'Comércio / indústria' }, { value: 'servicos', label: 'Serviços' }]} />
          </Field>
        )}
        <Field label="UF"><TextInput className="w-full" value={d.uf} onChange={(v) => set('uf', v.toUpperCase().slice(0, 2))} /></Field>
        <Field label="Cidade"><TextInput className="w-full" value={d.cidade} onChange={(v) => set('cidade', v)} /></Field>
        <Field label="Nome fantasia"><TextInput className="w-full" value={d.nomeFantasia} onChange={(v) => set('nomeFantasia', v)} /></Field>
        <Field label="Porte">
          <Select className="w-full" value={d.porte} onChange={(v) => set('porte', v)}
            options={[{ value: '', label: 'Não informado' }, { value: 'mei', label: 'MEI' }, { value: 'micro', label: 'Microempresa' }, { value: 'pequena', label: 'Pequena' }, { value: 'media', label: 'Média' }, { value: 'grande', label: 'Grande' }]} />
        </Field>
        <Field label="Ano de início das atividades"><TextInput className="w-full" value={d.anoInicio} onChange={(v) => set('anoInicio', v.replace(/\D/g, '').slice(0, 4))} placeholder="2018" /></Field>
        <Field label="Site"><TextInput className="w-full" value={d.site} onChange={(v) => set('site', v)} placeholder="www.exemplo.com.br" /></Field>
        <Field label="Responsável pelas informações"><TextInput className="w-full" value={d.responsavel} onChange={(v) => set('responsavel', v)} /></Field>
        <Field label="E-mail de contato"><TextInput className="w-full" value={d.emailContato} onChange={(v) => set('emailContato', v)} /></Field>
        <Field label="Telefone de contato"><TextInput className="w-full" value={d.telefone} onChange={(v) => set('telefone', v)} /></Field>
        <Field label="O que a empresa faz" help="Resumo dos produtos/serviços e do problema que resolve. Aparece no relatório." wide>
          <textarea value={d.descricaoAtividade} onChange={(e) => set('descricaoAtividade', e.target.value)} rows={3}
            className="rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
        </Field>
        <label className="flex items-start gap-2 rounded-md bg-brand-soft px-3 py-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-1" checked={d.consentimento} onChange={(e) => set('consentimento', e.target.checked)} />
          <span><b>Autorização para análise (LGPD).</b> A empresa autorizou o uso dos seus dados financeiros para esta análise e a emissão do relatório.</span>
        </label>
      </div>
      {erro && <p className="mt-3 text-sm text-bad">{erro}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={salvar} disabled={salvando || d.razaoSocial.trim().length < 2}>{d.id ? 'Salvar alterações' : 'Criar empresa'}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancelar</Button>}
      </div>
    </Card>
  )
}

/** Dígitos verificadores do CNPJ. */
export function cnpjValido(v: string): boolean {
  const c = v.replace(/\D/g, '')
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = base.split('').reduce((a, n, i) => a + Number(n) * pesos[i], 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(c.slice(0, 12))
  return d1 === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13])
}
