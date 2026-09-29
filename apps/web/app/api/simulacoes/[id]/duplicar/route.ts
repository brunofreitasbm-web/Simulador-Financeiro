import { NextResponse } from 'next/server'
import { criarCliente } from '@/lib/supabase/server'
import { duplicarSimulacao } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await duplicarSimulacao(await criarCliente(), (await params).id)
  return id ? NextResponse.json({ id }, { status: 201 }) : NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
}
