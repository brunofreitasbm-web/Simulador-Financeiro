import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui'
import { SemaforosSaude } from '@/components/saude/SemaforosSaude'
import { SeletorPeriodo } from '@/components/saude/SeletorPeriodo'
import { criarCliente } from '@/lib/supabase/server'
import { listarFontes, listarRealizado, obterEmpresa } from '@/lib/db/repo'
import { competenciaAtual } from '@/lib/realizadoCatalogo'
import { calcularBalancoTReal, calcularDREReal, calcularSemaforosSaude } from '@/lib/saudeReal'

export const dynamic = 'force-dynamic'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export default async function SaudePage({
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

  const [meses, fontes] = await Promise.all([
    listarRealizado(sb, id, { ate: competenciaAtual(), meses: 24 }),
    listarFontes(sb, id),
  ])

  // Identificar meses disponíveis e o selecionado
  const compsDisponiveis = meses.map((m) => m.competencia)
  const mesesComDados = meses.filter((m) => m.status !== 'vazio')
  const compSelecionada =
    sp.mes && compsDisponiveis.includes(sp.mes)
      ? sp.mes
      : mesesComDados.length > 0
      ? mesesComDados[mesesComDados.length - 1].competencia
      : compsDisponiveis[compsDisponiveis.length - 1]

  const mesAtual = meses.find((m) => m.competencia === compSelecionada) ?? meses[meses.length - 1]

  const dre = calcularDREReal(mesAtual)
  const bp = calcularBalancoTReal(mesAtual)
  const saude = calcularSemaforosSaude(dre, bp)

  const alimentada = fontes.some((f) => f.ativo)

  return (
    <div className="space-y-6">
      {/* Topo Executivo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🩺</span>
            <h1 className="text-xl font-bold text-ink">
              {empresa.nomeFantasia || empresa.razaoSocial}
            </h1>
            <Badge tone="info">Saúde Financeira Real</Badge>
            {alimentada ? (
              <Badge tone="ok">fontes sincronizadas</Badge>
            ) : (
              <Badge tone="neutral">lançamento manual</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Espelho real das operações financeiras · Sem dados simulados ou hipóteses
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/empresas/${id}/balanco?mes=${compSelecionada}`}
            className="rounded-md border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
          >
            ⚖️ Ver Balanço em T
          </Link>
          <Link
            href={`/empresas/${id}/dre?mes=${compSelecionada}`}
            className="rounded-md border border-brand bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            📈 Ver DRE em Cascata
          </Link>
        </div>
      </div>

      {/* Seletor de Período */}
      <SeletorPeriodo
        empresaId={id}
        competenciaAtual={compSelecionada}
        competencias={compsDisponiveis}
        rotaBase="saude"
      />

      {/* 4 Semáforos Principais */}
      <SemaforosSaude saude={saude} />

      {/* Visão Rápida dos Demonstrativos */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Card Resumo do Balanço */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-card p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Patrimônio Real
              </span>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                Balanço em T
              </span>
            </div>
            <h3 className="mt-2 text-base font-bold text-ink">Posição Patrimonial do Mês</h3>
            <p className="mt-1 text-xs text-ink-soft">
              Saldo em caixa, valores a receber e compromissos exigíveis no período.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line/60 pt-3">
              <div>
                <span className="text-[11px] text-ink-soft">Ativo Total (Bens & Direitos)</span>
                <p className="text-base font-bold font-mono text-ink">{fmt(bp.ativo.total)}</p>
                <span className="text-[10px] text-ink-soft">
                  Caixa: {fmt(bp.ativo.circulante.caixa)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-soft">Passivo a Pagar (Curto Prazo)</span>
                <p className="text-base font-bold font-mono text-rose-700">
                  {fmt(bp.passivo.circulante.total)}
                </p>
                <span className="text-[10px] text-emerald-700 font-semibold">
                  Patrimônio Líquido: {fmt(bp.passivo.patrimonioLiquido)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-3">
            <Link
              href={`/empresas/${id}/balanco?mes=${compSelecionada}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            >
              Abrir Balanço em T completo com barras didáticas ➔
            </Link>
          </div>
        </div>

        {/* Card Resumo da DRE */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-card p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
                Resultado Operacional
              </span>
              <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                DRE em Cascata
              </span>
            </div>
            <h3 className="mt-2 text-base font-bold text-ink">Faturamento & Resultado Líquido</h3>
            <p className="mt-1 text-xs text-ink-soft">
              Decomposição visual de receitas, custos e margem final que sobra no bolso.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line/60 pt-3">
              <div>
                <span className="text-[11px] text-ink-soft">Receita Bruta Faturada</span>
                <p className="text-base font-bold font-mono text-ink">{fmt(dre.receitaBruta)}</p>
                <span className="text-[10px] text-ink-soft">
                  Líquida: {fmt(dre.receitaLiquida)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-soft">Lucro Líquido Real</span>
                <p
                  className={`text-base font-bold font-mono ${
                    dre.lucroLiquido >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {fmt(dre.lucroLiquido)}
                </p>
                <span className="text-[10px] font-semibold text-ink-soft">
                  Margem: {(dre.lucroLiquidoPct * 100).toFixed(1).replace('.', ',')}%
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-3">
            <Link
              href={`/empresas/${id}/dre?mes=${compSelecionada}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            >
              Abrir DRE em Cascata completa com margens ➔
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
