import { NextResponse } from 'next/server'
import { criarCliente } from '@/lib/supabase/server'
import { editarRealizado, fecharRealizado, listarFontes, listarRealizado, listarSincronizacoes, obterEmpresa } from '@/lib/db/repo'
import { EdicaoRealizadoBody } from '@/lib/realizadoSchema'
import { competenciaAtual } from '@/lib/realizadoCatalogo'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

/** GET ?ate=YYYY-MM&meses=12 → { meses, fontes, sincronizacoes } */
export async function GET(req: Request, { params }: Ctx) {
  const id = (await params).id
  const sb = await criarCliente()
  if (!(await obterEmpresa(sb, id))) return NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
  const u = new URL(req.url)
  const ate = /^\d{4}-\d{2}$/.test(u.searchParams.get('ate') ?? '') ? u.searchParams.get('ate')! : competenciaAtual()
  const meses = Math.min(36, Math.max(1, Number(u.searchParams.get('meses') ?? 12) || 12))
  const [lista, fontes, sincronizacoes] = await Promise.all([listarRealizado(sb, id, { ate, meses }), listarFontes(sb, id), listarSincronizacoes(sb, id)])
  return NextResponse.json({ meses: lista, fontes, sincronizacoes })
}

/** PATCH: edita uma célula ({competencia, campo, valor, obs?}) ou fecha/reabre um mês ({competencia, fechado}). */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = (await params).id
  const p = EdicaoRealizadoBody.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 })
  const sb = await criarCliente()
  try {
    const mes = 'fechado' in p.data
      ? await fecharRealizado(sb, id, p.data.competencia, p.data.fechado)
      : await editarRealizado(sb, id, p.data.competencia, p.data.campo, p.data.valor, p.data.obs)
    return NextResponse.json(mes)
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'erro' }, { status: 400 })
  }
}
