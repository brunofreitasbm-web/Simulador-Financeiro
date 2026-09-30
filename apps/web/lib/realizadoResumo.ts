import type { CampoRealizado, RealizadoMensal } from '@sf/engine'

const SAIDAS: CampoRealizado[] = ['compras', 'frete', 'comissoes', 'impostosVendas', 'irCsll', 'folha', 'encargos', 'temporarios', 'proLabore', 'repassesTerapeutas', 'aluguel', 'manutencao', 'fixosOutros', 'marketing']

export interface ResumoMes { competencia: string; receita: number; resultado: number; caixa: number | null; pedidos: number | null }

/** Receita e resultado aproximado do mês (receita líquida − custos e despesas lançados; ignora distribuição de lucros). */
export function resumoMes(m: RealizadoMensal): ResumoMes | null {
  const v = m.valores
  if (m.status === 'vazio' || v.receitaBruta == null) return null
  const liquida = v.receitaBruta - (v.descontos ?? 0) - (v.cancelamentos ?? 0)
  const saidas = SAIDAS.reduce((s, k) => s + (v[k] ?? 0), 0)
  return { competencia: m.competencia, receita: v.receitaBruta, resultado: liquida - saidas, caixa: v.caixaFinal ?? null, pedidos: v.qtdPedidos ?? null }
}

/** Último mês com dados e o anterior (para variação). */
export function ultimosResumos(meses: RealizadoMensal[]): { atual: ResumoMes | null; anterior: ResumoMes | null } {
  const rs = meses.map(resumoMes).filter((r): r is ResumoMes => r !== null)
  return { atual: rs[rs.length - 1] ?? null, anterior: rs[rs.length - 2] ?? null }
}
