import { notFound } from 'next/navigation'
import { Editor } from '@/components/editor/Editor'
import { criarCliente } from '@/lib/supabase/server'
import { carregarRascunho } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'

export default async function SimulacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await carregarRascunho(await criarCliente(), id)
  if (!c) notFound()
  return <Editor id={id} empresaId={c.empresaId} inicial={c.rascunho} />
}
