import { NextResponse } from 'next/server'
import { criarCliente } from '@/lib/supabase/server'
import { criarSimulacao, listarSimulacoes } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Ctx) {
  return NextResponse.json(await listarSimulacoes(await criarCliente(), (await params).id))
}

export async function POST(req: Request, { params }: Ctx) {
  const body = (await req.json().catch(() => ({}))) as { nome?: string }
  const id = await criarSimulacao(await criarCliente(), (await params).id, body.nome)
  return NextResponse.json({ id }, { status: 201 })
}
