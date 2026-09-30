import { NextResponse } from 'next/server'
import { criarCliente } from '@/lib/supabase/server'
import { listarFontes, obterEmpresa, salvarFontes } from '@/lib/db/repo'
import { FontesBody } from '@/lib/realizadoSchema'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Ctx) {
  return NextResponse.json(await listarFontes(await criarCliente(), (await params).id))
}

/** Substitui as fontes de dados da empresa (uma por tipo: pdv, clinica, rh). */
export async function PUT(req: Request, { params }: Ctx) {
  const id = (await params).id
  const p = FontesBody.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 })
  const sb = await criarCliente()
  if (!(await obterEmpresa(sb, id))) return NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
  return NextResponse.json(await salvarFontes(sb, id, p.data))
}
