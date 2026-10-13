import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CadastroEmpresa } from '@/components/CadastroEmpresa'
import { Badge } from '@/components/ui'
import { criarCliente } from '@/lib/supabase/server'
import { contarMesesRealizado, listarFontes, obterEmpresa } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'

const REGIME: Record<string, string> = {
  simples: 'Simples Nacional',
  presumido: 'Lucro Presumido',
  real: 'Lucro Real',
  mei: 'MEI',
}

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await criarCliente()
  const empresa = await obterEmpresa(sb, id)
  if (!empresa) notFound()

  const [nMeses, fontes] = await Promise.all([
    contarMesesRealizado(sb, id),
    listarFontes(sb, id),
  ])
  const alimentada = fontes.some((f) => f.ativo)

  return (
    <div className="space-y-6">
      {/* Topo Executivo */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <Link href="/empresas" className="text-xs text-ink-soft hover:text-ink">
            ← Voltar para Todas as Empresas
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-ink">
              {empresa.nomeFantasia ?? empresa.razaoSocial}
            </h1>
            <Badge tone="info">{REGIME[empresa.regimeTributario]}</Badge>
            {alimentada ? (
              <Badge tone="ok">alimentada automaticamente</Badge>
            ) : (
              <Badge tone="neutral">lançamento manual</Badge>
            )}
            <Badge tone={nMeses ? 'ok' : 'warn'}>
              {nMeses ? `${nMeses} meses com dados reais` : 'sem dados lançados'}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/empresas/${id}/saude`}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            🩺 Acessar Saúde Financeira ➔
          </Link>
        </div>
      </div>

      {/* Cartões de Acesso Rápido às Novas Telas Dedicadas */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={`/empresas/${id}/saude`}
          className="group rounded-xl border border-line bg-card p-4 shadow-xs transition-all hover:border-brand hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">🩺</span>
            <span className="text-xs font-semibold text-brand group-hover:underline">Abrir ➔</span>
          </div>
          <h3 className="mt-2 text-sm font-bold text-ink">Saúde Geral & Semáforos</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Liquidez corrente, margens reais, ponto de equilíbrio e runway de caixa.
          </p>
        </Link>

        <Link
          href={`/empresas/${id}/balanco`}
          className="group rounded-xl border border-line bg-card p-4 shadow-xs transition-all hover:border-emerald-600 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">⚖️</span>
            <span className="text-xs font-semibold text-emerald-700 group-hover:underline">Abrir ➔</span>
          </div>
          <h3 className="mt-2 text-sm font-bold text-ink">Balanço em 'T' Didático</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Ativo à esquerda, Passivo e PL à direita com barras de peso e batimento.
          </p>
        </Link>

        <Link
          href={`/empresas/${id}/dre`}
          className="group rounded-xl border border-line bg-card p-4 shadow-xs transition-all hover:border-teal-600 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">📈</span>
            <span className="text-xs font-semibold text-teal-700 group-hover:underline">Abrir ➔</span>
          </div>
          <h3 className="mt-2 text-sm font-bold text-ink">DRE em Cascata</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Gráfico Waterfall de receitas até o lucro líquido real com margens %.
          </p>
        </Link>

        <Link
          href={`/empresas/${id}/realizado`}
          className="group rounded-xl border border-line bg-card p-4 shadow-xs transition-all hover:border-indigo-600 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">🔄</span>
            <span className="text-xs font-semibold text-indigo-700 group-hover:underline">Abrir ➔</span>
          </div>
          <h3 className="mt-2 text-sm font-bold text-ink">Operações & Sincronização</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Lançamentos mês a mês, fontes de dados (PDV, Clínica, RH) e conciliação.
          </p>
        </Link>
      </div>

      {/* Cadastro da Empresa */}
      <div className="pt-2">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Configurações Cadastrais da Empresa
        </h2>
        <CadastroEmpresa empresa={empresa} />
      </div>
    </div>
  )
}
