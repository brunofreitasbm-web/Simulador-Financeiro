import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui'
import { BarraSincronizacao } from '@/components/realizado/BarraSincronizacao'
import { FontesDados } from '@/components/realizado/FontesDados'
import { TabelaRealizado } from '@/components/realizado/TabelaRealizado'
import { criarCliente } from '@/lib/supabase/server'
import { listarFontes, listarRealizado, listarSincronizacoes, obterEmpresa } from '@/lib/db/repo'
import { competenciaAtual } from '@/lib/realizadoCatalogo'

export const dynamic = 'force-dynamic'

export default async function RealizadoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ meses?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const nMeses = sp.meses === '24' ? 24 : 12
  const sb = await criarCliente()
  const empresa = await obterEmpresa(sb, id)
  if (!empresa) notFound()
  const [meses, fontes, sincronizacoes] = await Promise.all([
    listarRealizado(sb, id, { ate: competenciaAtual(), meses: nMeses }), listarFontes(sb, id), listarSincronizacoes(sb, id, 5),
  ])
  const ultima = sincronizacoes[0]
  const sincronizados = meses.filter((m) => m.status !== 'vazio').length
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/empresas/${id}`} className="text-sm text-ink-soft hover:text-ink">← {empresa.nomeFantasia ?? empresa.razaoSocial}</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">Realizado</h1>
            {!ultima ? <Badge tone="neutral">nunca sincronizado</Badge>
              : ultima.status === 'ok' ? <Badge tone="ok">última sincronização ok · {new Date(ultima.iniciadoEm).toLocaleString('pt-BR')}</Badge>
              : ultima.status === 'executando' ? <Badge tone="info">sincronizando…</Badge>
              : <Badge tone={ultima.status === 'erro' ? 'bad' : 'warn'}>última sincronização {ultima.status} · {new Date(ultima.iniciadoEm).toLocaleString('pt-BR')}</Badge>}
            <Badge tone="neutral">{sincronizados} de {meses.length} meses com dados</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">
            Dados reais espelhados dos sistemas da operação, mês a mês. A escuta automática roda no 4º último dia de cada mês.
            Célula vazia está sinalizada com o motivo; clique para preencher à mão (o valor digitado vence a sincronização).
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-soft">Janela:</span>
          <Link href={`/empresas/${id}/realizado`} className={`rounded-md border px-2 py-1 ${nMeses === 12 ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line'}`}>12 meses</Link>
          <Link href={`/empresas/${id}/realizado?meses=24`} className={`rounded-md border px-2 py-1 ${nMeses === 24 ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line'}`}>24 meses</Link>
        </div>
      </div>
      <BarraSincronizacao empresaId={id} sincronizacoes={sincronizacoes} temFontes={fontes.some((f) => f.ativo)} />
      <TabelaRealizado empresaId={id} meses={meses} />
      <FontesDados empresaId={id} fontes={fontes} />
    </div>
  )
}
