'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { EmpresaForm } from './EmpresaForm'
import { rotuloCompetencia } from '@/lib/realizadoCatalogo'
import type { ResumoMes } from '@/lib/realizadoResumo'
import { Badge, Button, Card, TextInput } from './ui'

export interface EmpresaLinha {
  id: string; razaoSocial: string; cnpj: string | null; regimeTributario: string; cidade: string | null; uf: string | null; nSimulacoes: number
  nMeses: number; resumo: ResumoMes | null; fontes: string[]; ultima: { status: 'ok' | 'parcial' | 'erro' | 'executando'; em: string } | null
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
        <h1 className="text-xl font-semibold">Início · Empresas</h1>
        <div className="flex gap-2">
          <TextInput value={busca} onChange={setBusca} placeholder="Buscar por nome ou CNPJ" className="w-64" />
          <Button onClick={() => setCriando((v) => !v)}>{criando ? 'Fechar' : 'Nova empresa'}</Button>
        </div>
      </div>
      {criando && <EmpresaForm onCancel={empresas.length ? () => setCriando(false) : undefined} />}
      {empresas.length === 0 && !criando ? null : filtradas.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhuma empresa encontrada.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((e) => (
            <Card key={e.id} className="flex flex-col gap-3 p-4">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{e.razaoSocial}</div>
                <div className="text-xs text-ink-soft">
                  {e.cnpj ? formatarCnpj(e.cnpj) : 'sem CNPJ'}{e.cidade ? ` · ${e.cidade}${e.uf ? `/${e.uf}` : ''}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="info">{REGIME[e.regimeTributario]}</Badge>
                <Badge tone={e.nMeses ? 'ok' : 'warn'}>{e.nMeses ? `${e.nMeses} mês(es) com dados` : 'sem dados'}</Badge>
                {e.fontes.length === 0 && <Badge tone="warn">sem fonte de dados</Badge>}
                {e.ultima && e.ultima.status !== 'ok' && <Badge tone={e.ultima.status === 'erro' ? 'bad' : 'warn'}>sincronização {e.ultima.status}</Badge>}
              </div>
              {e.resumo && (
                <div className="grid grid-cols-2 gap-2 rounded-md bg-paper p-2">
                  <div><div className="text-xs text-ink-soft">Receita · {rotuloCompetencia(e.resumo.competencia)}</div><div className="num font-semibold">{brl(e.resumo.receita)}</div></div>
                  <div><div className="text-xs text-ink-soft">Resultado (aprox.)</div><div className={`num font-semibold ${e.resumo.resultado < 0 ? 'text-bad' : ''}`}>{brl(e.resumo.resultado)}</div></div>
                </div>
              )}
              <div className="text-xs text-ink-soft">
                {e.ultima ? `Última sincronização: ${new Date(e.ultima.em).toLocaleString('pt-BR')}` : 'Nunca sincronizada'}
              </div>
              <div className="mt-auto flex items-center gap-2 pt-1">
                <Link href={`/empresas/${e.id}/realizado`} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark">Abrir Realizado</Link>
                <Link href={`/empresas/${e.id}`} className="inline-flex min-h-10 items-center rounded-md border border-line px-3 py-2 text-sm hover:bg-paper">Cadastro</Link>
                <Button variant="danger" onClick={() => excluir(e)}>Excluir</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function formatarCnpj(c: string) {
  const d = c.replace(/\D/g, '')
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c
}
