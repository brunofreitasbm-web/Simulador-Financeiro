'use client'

import type { BalancoTCalculado } from '@/lib/saudeReal'

interface Props {
  balanco: BalancoTCalculado
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export function BalancoEmT({ balanco }: Props) {
  const { ativo, passivo, equilibrado, diferenca, proporcoes } = balanco

  return (
    <div className="space-y-4">
      {/* Cabeçalho de Batimento Contábil */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <span>⚖️</span> Balanço Patrimonial em 'T'
            <span className="text-xs font-normal text-ink-soft">
              Competência {balanco.competencia}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Visualização didática de duas colunas: tudo que a empresa possui (Ativos) à esquerda versus a origem desses recursos (Dívidas e Capital Próprio) à direita.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {equilibrado ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Equilíbrio Contábil Perfeito (Ativo = Passivo + PL)
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Divergência Contábil: {fmt(diferenca)}
            </div>
          )}
        </div>
      </div>

      {/* O 'T' Clássico em Duas Colunas */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* LADO ESQUERDO: ATIVO */}
        <div className="flex flex-col justify-between rounded-xl border-2 border-emerald-500/30 bg-card p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Lado Esquerdo
                </span>
                <h3 className="text-xl font-bold text-ink">ATIVO TOTAL</h3>
                <p className="text-xs text-ink-soft">Bens, direitos e recursos disponíveis</p>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold font-mono text-emerald-700">
                  {fmt(ativo.total)}
                </span>
                <span className="block text-[11px] font-medium text-ink-soft">100% dos ativos</span>
              </div>
            </div>

            {/* Grupo Ativo Circulante */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-ink-soft">
                <span>Ativo Circulante (Curto Prazo)</span>
                <span className="font-mono text-ink">{fmt(ativo.circulante.total)}</span>
              </div>

              {/* Caixa e Bancos */}
              <div className="rounded-lg border border-line bg-paper/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Caixa & Equivalentes
                  </span>
                  <span className="font-bold font-mono text-ink">{fmt(ativo.circulante.caixa)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, proporcoes.caixaPctAtivo * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-ink-soft w-12 text-right">
                    {(proporcoes.caixaPctAtivo * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">Dinheiro disponível imediato em conta bancária e caixa.</p>
              </div>

              {/* Contas a Receber */}
              <div className="rounded-lg border border-line bg-paper/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-teal-500" />
                    Contas a Receber (Clientes)
                  </span>
                  <span className="font-bold font-mono text-ink">{fmt(ativo.circulante.contasReceber)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${Math.min(100, proporcoes.contasReceberPctAtivo * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-ink-soft w-12 text-right">
                    {(proporcoes.contasReceberPctAtivo * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">Vendas a prazo, cartões de crédito e faturas a vencer.</p>
              </div>

              {/* Estoques */}
              <div className="rounded-lg border border-line bg-paper/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-500" />
                    Estoque & Mercadorias
                  </span>
                  <span className="font-bold font-mono text-ink">{fmt(ativo.circulante.estoque)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-500"
                      style={{ width: `${Math.min(100, proporcoes.estoquePctAtivo * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-ink-soft w-12 text-right">
                    {(proporcoes.estoquePctAtivo * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">Produtos e insumos armazenados para venda ou consumo.</p>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-emerald-500/20 pt-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800">TOTAL DO ATIVO</span>
            <span className="text-lg font-bold font-mono text-emerald-800">{fmt(ativo.total)}</span>
          </div>
        </div>

        {/* LADO DIREITO: PASSIVO + PATRIMÔNIO LÍQUIDO */}
        <div className="flex flex-col justify-between rounded-xl border-2 border-indigo-500/30 bg-card p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                  Lado Direito
                </span>
                <h3 className="text-xl font-bold text-ink">PASSIVO + PL</h3>
                <p className="text-xs text-ink-soft">Dívidas com terceiros e capital dos sócios</p>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold font-mono text-indigo-700">
                  {fmt(passivo.totalComPL)}
                </span>
                <span className="block text-[11px] font-medium text-ink-soft">100% da origem</span>
              </div>
            </div>

            {/* Grupo Passivo Circulante */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-ink-soft">
                <span>Passivo Circulante (Dívidas de Curto Prazo)</span>
                <span className="font-mono text-ink">{fmt(passivo.circulante.total)}</span>
              </div>

              {/* Contas a Pagar */}
              <div className="rounded-lg border border-line bg-paper/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Fornecedores & Contas a Pagar
                  </span>
                  <span className="font-bold font-mono text-ink">{fmt(passivo.circulante.contasPagar)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-500"
                      style={{ width: `${Math.min(100, proporcoes.contasPagarPctPassivo * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-ink-soft w-12 text-right">
                    {(proporcoes.contasPagarPctPassivo * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">Boletos de fornecedores, contas de consumo e salários a pagar.</p>
              </div>

              {/* Passivo Pré-pago */}
              <div className="rounded-lg border border-line bg-paper/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Passivo Pré-pago / Vouchers
                  </span>
                  <span className="font-bold font-mono text-ink">{fmt(passivo.circulante.passivoPrepago)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${Math.min(100, proporcoes.prepagoPctPassivo * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-ink-soft w-12 text-right">
                    {(proporcoes.prepagoPctPassivo * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">Valores recebidos antecipadamente de clientes com entrega futura.</p>
              </div>

              {/* Patrimônio Líquido */}
              <div className="mt-4 border-t border-line/60 pt-3">
                <div className="flex items-center justify-between text-xs font-semibold uppercase text-ink-soft">
                  <span>Patrimônio Líquido (Capital Próprio)</span>
                  <span className="font-mono text-indigo-700 font-bold">{fmt(passivo.patrimonioLiquido)}</span>
                </div>

                <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-indigo-600" />
                      Riqueza Real dos Sócios (PL)
                    </span>
                    <span className="font-bold font-mono text-indigo-900">{fmt(passivo.patrimonioLiquido)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-600"
                        style={{ width: `${Math.min(100, Math.max(0, proporcoes.plPctPassivo * 100))}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-indigo-900 w-12 text-right">
                      {(proporcoes.plPctPassivo * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-indigo-950/70">
                    O que sobra de verdade para a empresa após quitar 100% de todas as dívidas com terceiros.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-indigo-500/20 pt-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-800">TOTAL PASSIVO + PL</span>
            <span className="text-lg font-bold font-mono text-indigo-800">{fmt(passivo.totalComPL)}</span>
          </div>
        </div>
      </div>

      {/* Cartão de Resumo Didático */}
      <div className="rounded-xl border border-line bg-paper p-4 text-xs text-ink-soft flex items-start gap-3">
        <span className="text-lg">💡</span>
        <div>
          <strong className="text-ink font-semibold">Como ler este Balanço sem complicação:</strong>
          <p className="mt-0.5 leading-relaxed">
            Se a empresa precisasse encerrar suas atividades hoje, ela usaria os <strong className="text-ink">{fmt(ativo.total)}</strong> do Ativo para quitar os <strong className="text-ink">{fmt(passivo.circulante.total)}</strong> devidos a fornecedores e compromissos. O saldo restante de <strong className="text-emerald-700">{fmt(passivo.patrimonioLiquido)}</strong> é o valor líquido real acumulado pela operação.
          </p>
        </div>
      </div>
    </div>
  )
}
