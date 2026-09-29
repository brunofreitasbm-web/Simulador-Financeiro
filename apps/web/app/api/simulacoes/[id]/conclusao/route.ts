import { NextResponse } from 'next/server'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { criarCliente } from '@/lib/supabase/server'
import { carregarRascunho } from '@/lib/db/repo'
import { simular } from '@/lib/motor'
import { AVISO_CONTADOR, montarEntrada, montarPrompt, PROMPT_VERSION, SYSTEM_PROMPT, validarNumeros } from '@/lib/conclusaoIA'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
type Ctx = { params: Promise<{ id: string }> }

const mapa = (c: Record<string, unknown>) => ({
  id: c.id, cenarioTipo: c.cenario_tipo, cenarioNome: c.cenario_nome, modelo: c.modelo, promptVersion: c.prompt_version,
  texto: c.texto, numerosValidados: c.numeros_validados, criadoEm: c.created_at,
})

/** Conclusões já geradas (mais recentes primeiro). */
export async function GET(_: Request, { params }: Ctx) {
  const sb = await criarCliente()
  const { data, error } = await sb.from('sim_conclusao_ia').select('*').eq('simulacao_id', (await params).id).order('created_at', { ascending: false }).limit(30)
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json(data.map(mapa))
}

/** Gera a conclusão de um cenário: Gemini (via Edge Function) + guardrail numérico (1 nova tentativa) + gravação. */
export async function POST(req: Request, { params }: Ctx) {
  const id = (await params).id
  const { cenario = 0 } = (await req.json().catch(() => ({}))) as { cenario?: number }
  const sb = await criarCliente()
  const c = await carregarRascunho(sb, id)
  if (!c) return NextResponse.json({ erro: 'não encontrada' }, { status: 404 })
  const r = c.rascunho
  const sims = r.cenarios.map((cn) => simular(r, cn.alavancas))
  const alvo = sims[cenario]
  if (!alvo) return NextResponse.json({ erro: 'cenário inexistente' }, { status: 400 })
  if (!alvo.ok) return NextResponse.json({ erro: 'Complete as premissas antes de gerar a conclusão.' }, { status: 422 })

  const validos = r.cenarios.flatMap((cn, i) => { const s = sims[i]; return s.ok ? [{ nome: cn.nome, r: s.resultado, i }] : [] })
  const entrada = montarEntrada(r.empresa.regime, r.horizonte, validos, validos.findIndex((v) => v.i === cenario))
  const prompt = montarPrompt(entrada)

  let texto = '', modelo = '', numerosValidados = false
  for (let tentativa = 0; tentativa < 2 && !numerosValidados; tentativa++) {
    const { data, error } = await sb.functions.invoke('gerar-conclusao', { body: { system: SYSTEM_PROMPT, prompt } })
    if (error) {
      const detalhe = error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error : undefined
      return NextResponse.json({ erro: detalhe ?? error.message }, { status: 502 })
    }
    texto = String(data.texto); modelo = String(data.modelo)
    numerosValidados = validarNumeros(texto, entrada).ok
  }
  texto = `${texto}\n\n${AVISO_CONTADOR}`

  const cn = r.cenarios[cenario]
  const { data: linha, error } = await sb.from('sim_conclusao_ia').insert({
    simulacao_id: id, cenario_tipo: cn.tipo, cenario_nome: cn.nome, modelo, prompt_version: PROMPT_VERSION, texto, numeros_validados: numerosValidados,
  }).select().single()
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json(mapa(linha), { status: 201 })
}
