import { notFound } from 'next/navigation'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { criarCliente } from '@/lib/supabase/server'
import { listarEmpresas, obterEmpresa } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'

export default async function EmpresaLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = await criarCliente()
  const empresa = await obterEmpresa(sb, id)
  if (!empresa) notFound()

  const todasEmpresas = await listarEmpresas(sb)

  return (
    <div className="-mx-4 -my-5 flex min-h-[calc(100vh-61px)]">
      <AppSidebar
        empresaId={id}
        razaoSocial={empresa.razaoSocial}
        nomeFantasia={empresa.nomeFantasia}
        empresas={todasEmpresas.map((e) => ({
          id: e.id,
          nome: e.nomeFantasia || e.razaoSocial,
        }))}
      />
      <div className="flex-1 min-w-0 px-4 py-5 sm:px-6">
        {children}
      </div>
    </div>
  )
}
