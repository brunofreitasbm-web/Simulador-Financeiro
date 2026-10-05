import { NextResponse } from 'next/server'
import { criarCliente } from '@/lib/supabase/server'
import { obterEmpresa, obterModeloCustos, salvarModeloCustos } from '@/lib/db/repo'
import { ModeloCustosBody } from '@/lib/realizadoSchema'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Ctx) {
  const id = (await params).id
  const sb = await criarCliente()
  if (!(await obterEmpresa(sb, id))) return NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
  return NextResponse.json(await obterModeloCustos(sb, id))
}

/** Salva o modelo de custos da empresa (taxas de cartão, alíquota, encargos, aluguel e fixos). */
export async function PUT(req: Request, { params }: Ctx) {
  const id = (await params).id
  const p = ModeloCustosBody.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 })
  const sb = await criarCliente()
  if (!(await obterEmpresa(sb, id))) return NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
  try {
    return NextResponse.json(await salvarModeloCustos(sb, id, p.data))
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'erro' }, { status: 400 })
  }
}
