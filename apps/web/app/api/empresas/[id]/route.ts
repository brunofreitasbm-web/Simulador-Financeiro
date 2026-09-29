import { NextResponse } from 'next/server'
import { criarCliente } from '@/lib/supabase/server'
import { atualizarEmpresa, excluirEmpresa, obterEmpresa } from '@/lib/db/repo'
import { EmpresaBody } from '@/lib/empresaSchema'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Ctx) {
  const e = await obterEmpresa(await criarCliente(), (await params).id)
  return e ? NextResponse.json(e) : NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const p = EmpresaBody.partial().safeParse(await req.json())
  if (!p.success) return NextResponse.json({ erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 })
  const e = await atualizarEmpresa(await criarCliente(), (await params).id, p.data as never)
  return e ? NextResponse.json(e) : NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
}

/** LGPD: exclusão em cascata de empresa e todas as suas simulações. */
export async function DELETE(_: Request, { params }: Ctx) {
  await excluirEmpresa(await criarCliente(), (await params).id)
  return new NextResponse(null, { status: 204 })
}
