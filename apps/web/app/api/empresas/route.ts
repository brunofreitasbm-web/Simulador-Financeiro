import { NextResponse } from 'next/server'
import { criarCliente } from '@/lib/supabase/server'
import { criarEmpresa, listarEmpresas } from '@/lib/db/repo'
import { EmpresaBody } from '@/lib/empresaSchema'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await listarEmpresas(await criarCliente()))
}

export async function POST(req: Request) {
  const p = EmpresaBody.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 })
  return NextResponse.json(await criarEmpresa(await criarCliente(), p.data), { status: 201 })
}
