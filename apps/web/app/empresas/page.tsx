import { ListaEmpresas } from '@/components/ListaEmpresas'
import { criarCliente } from '@/lib/supabase/server'
import { listarEmpresas } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'

export default async function EmpresasPage() {
  const empresas = await listarEmpresas(await criarCliente())
  return <ListaEmpresas empresas={empresas} />
}
