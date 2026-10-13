'use client'

import { useState } from 'react'
import type { DRECalculada } from '@/lib/saudeReal'

interface Props {
  dre: DRECalculada
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export function DREWaterfall({ dre }: Props) {
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)

  const rb = dre.receitaBruta > 0 ? dre.receitaBruta : 1
  const pct = (v: number) => `${((v / rb) * 100).toFixed(1).replace('.', ',')}%`

  const degraus = [
    {
      tipo: 'origem' as const,
      titulo: '1. Receita Bruta',
      descricao: 'Total faturado no mês (vendas brutas de produtos e serviços)',
      valor: dre.receitaBruta,
      impacto: 'positivo' as const,
      pctRb: '100,0%',
      destaque: true,
      cor: 'bg-emerald-600 text-white',
    },
    {
      tipo: 'deducao' as const,
      titulo: '(-) Descontos & Cancelamentos',
      descricao: 'Abatimentos concedidos e vendas canceladas',
      valor: dre.descontos + dre.cancelamentos,
      impacto: 'negativo' as const,
      pctRb: pct(dre.descontos + dre.cancelamentos),
      destaque: false,
      cor: 'bg-rose-50 border border-rose-200 text-rose-800',
    },
    {
      tipo: 'subtotal' as const,
      titulo: '(=) Receita Líquida',
      descricao: 'O faturamento real que efetivamente entrou na empresa',
      valor: dre.receitaLiquida,
      impacto: 'subtotal' as const,
      pctRb: pct(dre.receitaLiquida),
      destaque: true,
      cor: 'bg-teal-50 border border-teal-300 text-teal-900',
    },
    {
      tipo: 'deducao' as const,
      titulo: '(-) Custos Diretos & Variáveis',
      descricao: 'Compras de mercadorias (CMV), fretes, comissões e impostos sobre vendas',
      valor: dre.custosVariaveis,
      impacto: 'negativo' as const,
      pctRb: pct(dre.custosVariaveis),
      destaque: false,
      cor: 'bg-amber-50 border border-amber-200 text-amber-800',
      subitens: [
        { nome: 'Compras / CMV', valor: dre.compras },
        { nome: 'Impostos s/ Vendas', valor: dre.impostosVendas },
        { nome: 'Comissões', valor: dre.comissoes },
        { nome: 'Frete', valor: dre.frete },
      ],
    },
    {
      tipo: 'subtotal' as const,
      titulo: '(=) Margem de Contribuição',
      descricao: 'O que sobra das vendas para pagar a estrutura fixa e gerar lucro',
      valor: dre.margemContribuicao,
      impacto: 'subtotal' as const,
      pctRb: pct(dre.margemContribuicao),
      margemInterna: `${(dre.margemContribuicaoPct * 100).toFixed(1).replace('.', ',')}% da Rec. Líquida`,
      destaque: true,
      cor: 'bg-sky-50 border border-sky-300 text-sky-900',
    },
    {
      tipo: 'deducao' as const,
      titulo: '(-) Estrutura Fixa & Pessoal',
      descricao: 'Salários, encargos, pró-labore, aluguel, manutenção e marketing',
      valor: dre.despesasOperacionais,
      impacto: 'negativo' as const,
      pctRb: pct(dre.despesasOperacionais),
      destaque: false,
      cor: 'bg-orange-50 border border-orange-200 text-orange-800',
      subitens: [
        { nome: 'Folha de Pagamento', valor: dre.folha },
        { nome: 'Encargos Trabalhistas', valor: dre.encargos },
        { nome: 'Pró-labore', valor: dre.proLabore },
        { nome: 'Aluguel', valor: dre.aluguel },
        { nome: 'Marketing & Divulgação', valor: dre.marketing },
        { nome: 'Manutenção & Outros', valor: dre.manutencao + dre.fixosOutros },
      ],
    },
    {
      tipo: 'subtotal' as const,
      titulo: '(=) EBITDA Real',
      descricao: 'Potencial de geração de caixa operacional da atividade-fim',
      valor: dre.ebitda,
      impacto: 'subtotal' as const,
      pctRb: pct(dre.ebitda),
      margemInterna: `${(dre.ebitdaPct * 100).toFixed(1).replace('.', ',')}% de Margem EBITDA`,
      destaque: true,
      cor: dre.ebitda >= 0 ? 'bg-indigo-50 border border-indigo-300 text-indigo-900' : 'bg-rose-50 border border-rose-300 text-rose-900',
    },
    {
      tipo: 'deducao' as const,
      titulo: '(-) Tributos s/ Lucro (IR/CSLL)',
      descricao: 'Imposto de renda e contribuição social do regime',
      valor: dre.irCsll,
      impacto: 'negativo' as const,
      pctRb: pct(dre.irCsll),
      destaque: false,
      cor: 'bg-gray-50 border border-gray-200 text-gray-700',
    },
    {
      tipo: 'resultado' as const,
      titulo: '(=) Lucro Líquido Real',
      descricao: 'Resultado financeiro líquido final do período',
      valor: dre.lucroLiquido,
      impacto: dre.lucroLiquido >= 0 ? 'positivo' : 'negativo',
      pctRb: pct(dre.lucroLiquido),
      margemInterna: `${(dre.lucroLiquidoPct * 100).toFixed(1).replace('.', ',')}% Margem Líquida Real`,
      destaque: true,
      cor: dre.lucroLiquido >= 0 ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <span>📈</span> DRE em Cascata (Waterfall)
            <span className="text-xs font-normal text-ink-soft">
              Competência {dre.competencia}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Demonstração de Resultado ilustrada: veja exatamente quanto de cada R$ 100 faturados é consumido por impostos, fornecedores e folha até chegar ao bolso.
          </p>
        </div>

        <button
          onClick={() => setDetalhesAbertos(!detalhesAbertos)}
          className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-line/40 transition-colors"
        >
          {detalhesAbertos ? 'Recolher detalhes de custos' : 'Expandir detalhamento de custos'}
        </button>
      </div>

      {/* Cascata Visual Ilustrativa */}
      <div className="relative space-y-2.5">
        {degraus.map((degrau, idx) => {
          return (
            <div
              key={degrau.titulo}
              className={`rounded-xl p-4 transition-all ${degrau.cor} ${
                degrau.destaque ? 'shadow-xs' : 'opacity-95'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{degrau.titulo}</span>
                    {degrau.margemInterna && (
                      <span className="rounded bg-black/10 px-2 py-0.5 text-[11px] font-semibold">
                        {degrau.margemInterna}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs opacity-90">{degrau.descricao}</p>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <span className="text-base font-extrabold font-mono tracking-tight">
                      {degrau.impacto === 'negativo' ? `-${fmt(degrau.valor)}` : fmt(degrau.valor)}
                    </span>
                    <span className="block text-[11px] font-mono opacity-80">
                      {degrau.pctRb} da receita
                    </span>
                  </div>
                </div>
              </div>

              {/* Subitens expansíveis (quando ativado) */}
              {detalhesAbertos && degrau.subitens && (
                <div className="mt-3 grid gap-2 border-t border-black/10 pt-2.5 text-xs sm:grid-cols-2 md:grid-cols-3">
                  {degrau.subitens.map((sub) => (
                    <div key={sub.nome} className="rounded bg-black/5 p-2 flex justify-between items-center">
                      <span className="opacity-90">{sub.nome}</span>
                      <span className="font-mono font-semibold">{fmt(sub.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Resumo Didático da DRE */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-card p-4">
          <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
            Margem de Contribuição
          </span>
          <p className="mt-1 text-2xl font-bold font-mono text-ink">
            {(dre.margemContribuicaoPct * 100).toFixed(1).replace('.', ',')}%
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            A cada R$ 100 vendidos, sobram R$ {(dre.margemContribuicaoPct * 100).toFixed(2).replace('.', ',')} após pagar custos diretos.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-card p-4">
          <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
            Margem EBITDA Real
          </span>
          <p className="mt-1 text-2xl font-bold font-mono text-ink">
            {(dre.ebitdaPct * 100).toFixed(1).replace('.', ',')}%
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Capacidade de geração de caixa genuína da operação antes de impostos e juros.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-card p-4">
          <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
            Margem Líquida Final
          </span>
          <p className={`mt-1 text-2xl font-bold font-mono ${dre.lucroLiquido >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {(dre.lucroLiquidoPct * 100).toFixed(1).replace('.', ',')}%
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {dre.lucroLiquido >= 0
              ? 'Lucro final que de fato capitaliza a empresa ou pode ser distribuído aos sócios.'
              : 'Prejuízo operacional líquido consumindo as reservas da empresa.'}
          </p>
        </div>
      </div>
    </div>
  )
}
