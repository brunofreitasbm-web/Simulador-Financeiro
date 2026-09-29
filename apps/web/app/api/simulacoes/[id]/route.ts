import { NextResponse } from 'next/server'
import { criarCliente } from '@/lib/supabase/server'
import { carregarRascunho, excluirSimulacao, salvarRascunho } from '@/lib/db/repo'
import type { Rascunho } from '@/lib/rascunho'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Ctx) {
  const c = await carregarRascunho(await criarCliente(), (await params).id)
  return c ? NextResponse.json(c) : NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
}

/** Salva o rascunho completo (autosave com debounce no cliente). */
export async function PUT(req: Request, { params }: Ctx) {
  const id = (await params).id
  const sb = await criarCliente()
  if (!(await carregarRascunho(sb, id))) return NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
  await salvarRascunho(sb, id, (await req.json()) as Rascunho)
  return NextResponse.json({ ok: true, salvoEm: new Date().toISOString() })
}

export async function DELETE(_: Request, { params }: Ctx) {
  await excluirSimulacao(await criarCliente(), (await params).id)
  return new NextResponse(null, { status: 204 })
}
