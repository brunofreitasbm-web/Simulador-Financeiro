import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui'
import { BalancoEmT } from '@/components/saude/BalancoEmT'
import { SeletorPeriodo } from '@/components/saude/SeletorPeriodo'
import { criarCliente } from '@/lib/supabase/server'
import { listarRealizado, obterEmpresa } from '@/lib/db/repo'
import { competenciaAtual } from '@/lib/realizadoCatalogo'
import { calcularBalancoTReal } from '@/lib/saudeReal'

export const dynamic = 'force-dynamic'

export default async function BalancoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mes?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const sb = await criarCliente()
  const empresa = await obterEmpresa(sb, id)
  if (!empresa) notFound()

  const meses = await listarRealizado(sb, id, { ate: competenciaAtual(), meses: 24 })

  const compsDisponiveis = meses.map((m) => m.competencia)
  const mesesComDados = meses.filter((m) => m.status !== 'vazio')
  const compSelecionada =
    sp.mes && compsDisponiveis.includes(sp.mes)
      ? sp.mes
      : mesesComDados.length > 0
      ? mesesComDados[mesesComDados.length - 1].competencia
      : compsDisponiveis[compsDisponiveis.length - 1]

  const mesAtual = meses.find((m) => m.competencia === compSelecionada) ?? meses[meses.length - 1]
  const balanco = calcularBalancoTReal(mesAtual)

  return (
    <div className="space-y-6">
      {/* Topo com Navegação Rápida */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚖️</span>
            <h1 className="text-xl font-bold text-ink">Balanço Patrimonial Ilustrado</h1>
            <Badge tone="ok">Espelho Real</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {empresa.nomeFantasia || empresa.razaoSocial} · Posição contábil e patrimonial detalhada
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/empresas/${id}/saude?mes=${compSelecionada}`}
            className="rounded-md border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
          >
            🩺 Painel de Saúde
          </Link>
          <Link
            href={`/empresas/${id}/dre?mes=${compSelecionada}`}
            className="rounded-md border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
          >
            📈 Ir para DRE em Cascata
          </Link>
        </div>
      </div>

      {/* Seletor de Período */}
      <SeletorPeriodo
        empresaId={id}
        competenciaAtual={compSelecionada}
        competencias={compsDisponiveis}
        rotaBase="balanco"
      />

      {/* Componente Balanço em T */}
      <BalancoEmT balanco={balanco} />
    </div>
  )
}
