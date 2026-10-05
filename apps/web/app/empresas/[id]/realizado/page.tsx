import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui'
import { BarraSincronizacao } from '@/components/realizado/BarraSincronizacao'
import { FontesDados } from '@/components/realizado/FontesDados'
import { ModeloCustos } from '@/components/realizado/ModeloCustos'
import { TabelaRealizado } from '@/components/realizado/TabelaRealizado'
import { criarCliente } from '@/lib/supabase/server'
import { listarEmpresas, listarFontes, listarRealizado, listarSincronizacoes, obterEmpresa, obterModeloCustos } from '@/lib/db/repo'
import { Destaques } from '@/components/realizado/Destaques'
import { ultimosResumos } from '@/lib/realizadoResumo'
import { MenuEmpresas } from '@/components/realizado/MenuEmpresas'
import { competenciaAtual } from '@/lib/realizadoCatalogo'

export const dynamic = 'force-dynamic'

export default async function RealizadoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ meses?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const nMeses = sp.meses === '24' ? 24 : 12
  const sb = await criarCliente()
  const empresa = await obterEmpresa(sb, id)
  if (!empresa) notFound()
  const [meses, fontes, sincronizacoes, empresas, modelo] = await Promise.all([
    listarRealizado(sb, id, { ate: competenciaAtual(), meses: nMeses }), listarFontes(sb, id), listarSincronizacoes(sb, id, 5), listarEmpresas(sb), obterModeloCustos(sb, id),
  ])
  const ultima = sincronizacoes[0]
  // a escuta automática falha em silêncio se ninguém olhar: avisa quando não há sincronização bem-sucedida recente
  const ultimaBoa = sincronizacoes.find((s) => s.status === 'ok' || s.status === 'parcial')
  const horasSemSincronizar = ultimaBoa ? (Date.now() - new Date(ultimaBoa.iniciadoEm).getTime()) / 3_600_000 : null
  const alerta = fontes.some((f) => f.ativo) && (horasSemSincronizar === null || horasSemSincronizar > 36)
    ? (horasSemSincronizar === null
      ? 'Nenhuma sincronização bem-sucedida nas últimas execuções: a escuta automática pode estar parada.'
      : `A última sincronização bem-sucedida foi há ${Math.floor(horasSemSincronizar)} h (a escuta roda todo dia): confira o histórico.`)
    : null
  const { atual, anterior } = ultimosResumos(meses)
  const sincronizados = meses.filter((m) => m.status !== 'vazio').length
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <MenuEmpresas atual={id} meses={nMeses} empresas={empresas.map((e) => ({ id: e.id, nome: e.razaoSocial }))} />
      <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold">{empresa.razaoSocial}</h1>
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
      {alerta && <div role="alert" className="rounded-md border border-bad bg-bad-soft/60 px-3 py-2 text-sm text-bad">{alerta}</div>}
      <Destaques atual={atual} anterior={anterior} />
      <BarraSincronizacao empresaId={id} sincronizacoes={sincronizacoes} temFontes={fontes.some((f) => f.ativo)} />
      <TabelaRealizado empresaId={id} meses={meses} />
      <ModeloCustos empresaId={id} modelo={modelo} />
      <FontesDados empresaId={id} fontes={fontes} />
      </div>
    </div>
  )
}
