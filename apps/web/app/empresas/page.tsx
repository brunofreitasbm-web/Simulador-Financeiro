import { ListaEmpresas, type EmpresaLinha } from '@/components/ListaEmpresas'
import { criarCliente } from '@/lib/supabase/server'
import { contarMesesRealizado, listarEmpresas, listarFontes, listarRealizado, listarSincronizacoes } from '@/lib/db/repo'
import { competenciaAtual } from '@/lib/realizadoCatalogo'
import { ultimosResumos } from '@/lib/realizadoResumo'

export const dynamic = 'force-dynamic'

/** Início: cada empresa com o estado da alimentação e um clique até o Realizado. */
export default async function EmpresasPage() {
  const sb = await criarCliente()
  const base = await listarEmpresas(sb)
  const empresas: EmpresaLinha[] = await Promise.all(base.map(async (e) => {
    const [nMeses, fontes, sinc, meses] = await Promise.all([contarMesesRealizado(sb, e.id), listarFontes(sb, e.id), listarSincronizacoes(sb, e.id, 1), listarRealizado(sb, e.id, { ate: competenciaAtual(), meses: 3 })])
    return { ...e, nMeses, resumo: ultimosResumos(meses).atual, fontes: fontes.filter((f) => f.ativo).map((f) => f.tipo), ultima: sinc[0] ? { status: sinc[0].status, em: sinc[0].iniciadoEm } : null }
  }))
  return <ListaEmpresas empresas={empresas} />
}
