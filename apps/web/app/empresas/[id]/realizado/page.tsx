import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui'
import { BarraSincronizacao } from '@/components/realizado/BarraSincronizacao'
import { FontesDados } from '@/components/realizado/FontesDados'
import { TabelaRealizado } from '@/components/realizado/TabelaRealizado'
import { criarCliente } from '@/lib/supabase/server'
import { listarEmpresas, listarFontes, listarRealizado, listarSincronizacoes, obterEmpresa } from '@/lib/db/repo'
import { Destaques } from '@/components/realizado/Destaques'
import { ultimosResumos } from '@/lib/realizadoResumo'
import { SeletorEmpresa } from '@/components/realizado/SeletorEmpresa'
import { competenciaAtual } from '@/lib/realizadoCatalogo'

export const dynamic = 'force-dynamic'

export default async function RealizadoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ meses?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const nMeses = sp.meses === '24' ? 24 : 12
  const sb = await criarCliente()
  const empresa = await obterEmpresa(sb, id)
  if (!empresa) notFound()
  const [meses, fontes, sincronizacoes, empresas] = await Promise.all([
    listarRealizado(sb, id, { ate: competenciaAtual(), meses: nMeses }), listarFontes(sb, id), listarSincronizacoes(sb, id, 5), listarEmpresas(sb),
  ])
  const ultima = sincronizacoes[0]
  const { atual, anterior } = ultimosResumos(meses)
  const sincronizados = meses.filter((m) => m.status !== 'vazio').length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/empresas" className="text-sm text-ink-soft hover:text-ink">← Início</Link>
        <SeletorEmpresa atual={id} meses={nMeses} empresas={empresas.map((e) => ({ id: e.id, nome: e.razaoSocial }))} />
        {!ultima ? <Badge tone="neutral">nunca sincronizado</Badge>
          : ultima.status === 'ok' ? <Badge tone="ok">sincronizado · {new Date(ultima.iniciadoEm).toLocaleString('pt-BR')}</Badge>
          : ultima.status === 'executando' ? <Badge tone="info">sincronizando…</Badge>
          : <Badge tone={ultima.status === 'erro' ? 'bad' : 'warn'}>última sincronização {ultima.status} · {new Date(ultima.iniciadoEm).toLocaleString('pt-BR')}</Badge>}
        <Badge tone="neutral">{sincronizados} de {meses.length} meses com dados</Badge>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Link href={`/empresas/${id}/realizado`} className={`min-h-9 rounded-md border px-3 py-1.5 ${nMeses === 12 ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line'}`}>12 meses</Link>
          <Link href={`/empresas/${id}/realizado?meses=24`} className={`min-h-9 rounded-md border px-3 py-1.5 ${nMeses === 24 ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line'}`}>24 meses</Link>
          <Link href={`/empresas/${id}`} className="px-2 py-1.5 text-ink-soft hover:text-ink">Cadastro</Link>
        </div>
      </div>
      <Destaques atual={atual} anterior={anterior} />
      <BarraSincronizacao empresaId={id} sincronizacoes={sincronizacoes} temFontes={fontes.some((f) => f.ativo)} />
      <TabelaRealizado empresaId={id} meses={meses} />
      <FontesDados empresaId={id} fontes={fontes} />
    </div>
  )
}
