import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ListaSimulacoes } from '@/components/ListaSimulacoes'
import { CadastroEmpresa } from '@/components/CadastroEmpresa'
import { Badge } from '@/components/ui'
import { criarCliente } from '@/lib/supabase/server'
import { listarSimulacoes, obterEmpresa } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'

const REGIME: Record<string, string> = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', mei: 'MEI' }

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await criarCliente()
  const empresa = await obterEmpresa(sb, id)
  if (!empresa) notFound()
  const sims = await listarSimulacoes(sb, id)
  return (
    <div className="space-y-6">
      <div>
        <Link href="/empresas" className="text-sm text-ink-soft hover:text-ink">← Empresas</Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{empresa.razaoSocial}</h1>
          <Badge tone="info">{REGIME[empresa.regimeTributario]}</Badge>
        </div>
      </div>
      <CadastroEmpresa empresa={empresa} />
      <ListaSimulacoes
        empresaId={id}
        simulacoes={sims.map((s) => (s))}
      />
    </div>
  )
}
