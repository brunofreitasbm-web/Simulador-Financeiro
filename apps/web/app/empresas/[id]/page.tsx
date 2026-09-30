import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ListaSimulacoes } from '@/components/ListaSimulacoes'
import { CadastroEmpresa } from '@/components/CadastroEmpresa'
import { Badge } from '@/components/ui'
import { criarCliente } from '@/lib/supabase/server'
import { contarMesesRealizado, listarFontes, listarSimulacoes, obterEmpresa } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'

const REGIME: Record<string, string> = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', mei: 'MEI' }

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await criarCliente()
  const empresa = await obterEmpresa(sb, id)
  if (!empresa) notFound()
  const [sims, nMeses, fontes] = await Promise.all([listarSimulacoes(sb, id), contarMesesRealizado(sb, id), listarFontes(sb, id)])
  const alimentada = fontes.some((f) => f.ativo)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/empresas" className="text-sm text-ink-soft hover:text-ink">← Empresas</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{empresa.nomeFantasia ?? empresa.razaoSocial}</h1>
            <Badge tone="info">{REGIME[empresa.regimeTributario]}</Badge>
            {alimentada ? <Badge tone="ok">alimentada automaticamente</Badge> : <Badge tone="neutral">sem fonte de dados</Badge>}
          </div>
        </div>
        <Link href={`/empresas/${id}/realizado`} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-brand-soft px-3 py-1.5 text-sm font-medium text-brand-dark hover:bg-[#d3eae6]">
          Realizado mês a mês <Badge tone={nMeses ? 'ok' : 'warn'}>{nMeses ? `${nMeses} mês(es) com dados` : 'sem dados'}</Badge>
        </Link>
      </div>
      <CadastroEmpresa empresa={empresa} />
      <ListaSimulacoes
        empresaId={id}
        simulacoes={sims.map((s) => (s))}
      />
    </div>
  )
}
