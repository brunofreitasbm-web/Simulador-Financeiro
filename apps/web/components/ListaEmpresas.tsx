'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { EmpresaForm } from './EmpresaForm'
import { Badge, Button, Card, TextInput } from './ui'

export interface EmpresaLinha {
  id: string; razaoSocial: string; cnpj: string | null; regimeTributario: string; cidade: string | null; uf: string | null; nSimulacoes: number
}

const REGIME: Record<string, string> = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', mei: 'MEI' }

export function ListaEmpresas({ empresas }: { empresas: EmpresaLinha[] }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(empresas.length === 0)
  const filtradas = empresas.filter((e) => `${e.razaoSocial} ${e.cnpj ?? ''}`.toLowerCase().includes(busca.toLowerCase()))

  async function excluir(e: EmpresaLinha) {
    if (!confirm(`Excluir "${e.razaoSocial}" e todas as ${e.nSimulacoes} simulações? Esta ação apaga os dados em cascata e não pode ser desfeita.`)) return
    await fetch(`/api/empresas/${e.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Empresas</h1>
        <div className="flex gap-2">
          <TextInput value={busca} onChange={setBusca} placeholder="Buscar por nome ou CNPJ" className="w-64" />
          <Button onClick={() => setCriando((v) => !v)}>{criando ? 'Fechar' : 'Nova empresa'}</Button>
        </div>
      </div>
      {criando && <EmpresaForm onCancel={empresas.length ? () => setCriando(false) : undefined} />}
      {empresas.length === 0 && !criando ? null : (
        <Card className="divide-y divide-line">
          {filtradas.length === 0 && <p className="p-4 text-sm text-ink-soft">Nenhuma empresa encontrada.</p>}
          {filtradas.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 p-4">
              <Link href={`/empresas/${e.id}`} className="min-w-0 flex-1">
                <div className="truncate font-medium text-brand-dark hover:underline">{e.razaoSocial}</div>
                <div className="text-xs text-ink-soft">
                  {e.cnpj ? formatarCnpj(e.cnpj) : 'sem CNPJ'}{e.cidade ? ` · ${e.cidade}${e.uf ? `/${e.uf}` : ''}` : ''}
                </div>
              </Link>
              <Badge tone="info">{REGIME[e.regimeTributario]}</Badge>
              <span className="w-28 text-right text-sm text-ink-soft">{e.nSimulacoes} simulaç{e.nSimulacoes === 1 ? 'ão' : 'ões'}</span>
              <Button variant="danger" onClick={() => excluir(e)}>Excluir</Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function formatarCnpj(c: string) {
  const d = c.replace(/\D/g, '')
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c
}
