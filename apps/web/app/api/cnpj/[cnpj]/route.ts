import { NextResponse } from 'next/server'
import { consultarCnpj } from '@/lib/cnpj'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: Promise<{ cnpj: string }> }) {
  const { cnpj } = await params
  try {
    const dados = await consultarCnpj(cnpj)
    if (!dados) return NextResponse.json({ erro: 'CNPJ não encontrado na Receita.' }, { status: 404 })
    return NextResponse.json(dados)
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Falha na consulta.' }, { status: 502 })
  }
}
