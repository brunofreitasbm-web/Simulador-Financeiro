import { NextResponse } from 'next/server'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { criarCliente } from '@/lib/supabase/server'
import { obterEmpresa } from '@/lib/db/repo'
import { SincronizarBody } from '@/lib/realizadoSchema'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
type Ctx = { params: Promise<{ id: string }> }

/** Dispara a Edge Function sim-sincronizar para esta empresa (com o JWT da sessão). */
export async function POST(req: Request, { params }: Ctx) {
  const id = (await params).id
  const p = SincronizarBody.safeParse(await req.json().catch(() => ({})))
  if (!p.success) return NextResponse.json({ erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 })
  const sb = await criarCliente()
  if (!(await obterEmpresa(sb, id))) return NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
  const { data, error } = await sb.functions.invoke('sim-sincronizar', { body: { empresa_id: id, competencias: p.data.competencias, sobrescrever: p.data.sobrescrever } })
  if (error) {
    let status = 502, detalhe: string | undefined
    if (error instanceof FunctionsHttpError) {
      status = error.context.status === 409 ? 409 : 502
      detalhe = ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error
    }
    return NextResponse.json({ erro: detalhe ?? error.message }, { status })
  }
  return NextResponse.json(data)
}
