import { NextResponse } from 'next/server'
import { criarCliente } from '@/lib/supabase/server'
import { atualizarEmpresa, importarUnidadesPdv } from '@/lib/db/repo'
import { consultarCnpj } from '@/lib/cnpj'

export const dynamic = 'force-dynamic'

/** Cria empresas a partir das unidades do PDV ainda não alimentadas e completa o cadastro pela Receita. */
export async function POST() {
  const sb = await criarCliente()
  const criadas = await importarUnidadesPdv(sb)
  const avisos: string[] = []
  for (const c of criadas) {
    if (!c.cnpj) { avisos.push(`${c.unidade}: sem CNPJ no PDV; complete o cadastro.`); continue }
    try {
      const d = await consultarCnpj(c.cnpj)
      if (!d) { avisos.push(`${c.unidade}: CNPJ não encontrado na Receita.`); continue }
      await atualizarEmpresa(sb, c.empresaId, {
        segmento: d.segmento, anoInicio: d.anoInicio, porte: d.porte,
        ...(d.regime ? { regime: d.regime } : {}), descricaoAtividade: d.descricaoAtividade, emailContato: d.email ?? undefined,
      })
    } catch (e) {
      avisos.push(`${c.unidade}: ${e instanceof Error ? e.message : 'falha ao consultar o CNPJ'}`)
    }
  }
  return NextResponse.json({ criadas: criadas.length, unidades: criadas.map((c) => c.unidade), avisos })
}
