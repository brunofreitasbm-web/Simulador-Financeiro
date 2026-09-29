import { REGISTRY, type BP, type BPKey, type DFCKey, type DREKey, type Resultado } from '@sf/engine'
import type { Linha } from '@/components/Tabela'

const dica = (m: { formulaLegivel: string; tipo: 'R' | 'P'; glossario: string }) =>
  `${m.glossario}\nFórmula: ${m.formulaLegivel}\n${m.tipo === 'R' ? 'Regra contábil' : 'Escolha do produto (configurável)'}`

export type Analise = 'nenhuma' | 'rb' | 'rl'

const DRE_ORDEM: [DREKey, Linha['estilo']][] = [
  ['rb', 'total'], ['descontos', 'normal'], ['impostos', 'normal'], ['rl', 'total'],
  ['cmv', 'normal'], ['comissoes', 'normal'], ['taxaCartao', 'normal'], ['frete', 'normal'], ['perdas', 'normal'], ['mc', 'total'],
  ['pessoal', 'normal'], ['gastosFixos', 'normal'], ['marketing', 'normal'], ['dasMei', 'normal'], ['ebitda', 'total'],
  ['depreciacao', 'normal'], ['ebit', 'total'],
  ['despFinanceiras', 'normal'], ['despFinDividas', 'sub'], ['despFinCheque', 'sub'], ['despFinAntecipacao', 'sub'],
  ['recFinanceiras', 'normal'], ['lair', 'total'], ['irCsll', 'normal'], ['ll', 'total'],
  ['distribuicao', 'normal'], ['resultadoApos', 'total'],
]

export function colunasMeses(r: Resultado, desdeZero = false): string[] {
  return r.meses.filter((m) => desdeZero || m.t > 0).map((m) => {
    const [a, mm] = m.competencia.split('-')
    return `${mm}/${a.slice(2)}`
  })
}

export function linhasDRE(r: Resultado, analise: Analise): Linha[] {
  const ms = r.meses.slice(1)
  const base = analise === 'rb' ? r.anual.dre.rb : analise === 'rl' ? r.anual.dre.rl : 0
  return DRE_ORDEM.filter(([k]) => !(k === 'dasMei' && r.anual.dre.dasMei === 0)).map(([k, estilo]) => ({
    chave: k, rotulo: REGISTRY.dre[k].rotulo, estilo, dica: dica(REGISTRY.dre[k]),
    valores: ms.map((m) => m.dre[k]),
    total: r.anual.dre[k],
    extras: analise === 'nenhuma' ? undefined : [base > 0 ? r.anual.dre[k] / base : null],
  }))
}

const g = (chave: string, rotulo: string): Linha => ({ chave, rotulo, estilo: 'grupo', valores: [] })

const BP_ORDEM: (BPKey | string)[] = [
  'g:Ativo', 'caixa', 'aplicacoes', 'contasReceber', 'pdd', 'estoque', 'ac', 'imobilizado', 'intangivel', 'anc', 'ativo',
  'g:Passivo', 'fornecedores', 'contasAPagar', 'emprestimosCP', 'parcelamentosCP', 'provisoesCP', 'pc',
  'emprestimosLP', 'parcelamentosLP', 'provisoesLP', 'pnc',
  'g:Patrimônio líquido', 'capitalSocial', 'resultadosAnteriores', 'resultadoPeriodo', 'pl', 'passivoPL',
]
const BP_TOTAIS = new Set<BPKey>(['ac', 'anc', 'ativo', 'pc', 'pnc', 'pl', 'passivoPL'])

export function linhasBP(r: Resultado): Linha[] {
  return BP_ORDEM.map((k) => {
    if (k.startsWith('g:')) return g(k, k.slice(2))
    if (k === 'resultadosAnteriores')
      return {
        chave: k, rotulo: 'Resultados acumulados anteriores (estimado pelo balanço de abertura)', estilo: 'normal', dica: dica(REGISTRY.bp.lucrosAcumulados),
        valores: r.meses.map(() => r.meses[0].bp.lucrosAcumulados), destaque: [0],
      } satisfies Linha
    if (k === 'resultadoPeriodo')
      return {
        chave: k, rotulo: 'Resultado do período (após distribuição)', estilo: 'normal', dica: 'Lucro acumulado desde a data-base, já descontada a distribuição aos sócios.',
        valores: r.meses.map((x) => x.bp.lucrosAcumulados - r.meses[0].bp.lucrosAcumulados),
      } satisfies Linha
    const key = k as BPKey
    const m = REGISTRY.bp[key]
    const val = (b: BP) => (key === 'pdd' ? -b.pdd : b[key])
    return {
      chave: key, rotulo: m.rotulo, estilo: BP_TOTAIS.has(key) ? 'total' : 'normal', dica: dica(m),
      valores: r.meses.map((x) => val(x.bp)),
      destaque: key === 'lucrosAcumulados' ? [0] : undefined,
    } satisfies Linha
  })
}

const DFC_ORDEM: [DFCKey, Linha['estilo']][] = [
  ['ll', 'normal'], ['depreciacao', 'sub'], ['varPdd', 'sub'], ['jurosCapitalizados', 'sub'], ['varContasReceber', 'sub'],
  ['varEstoque', 'sub'], ['varFornecedores', 'sub'], ['varContasAPagar', 'sub'], ['varProvisoes', 'sub'], ['fco', 'total'],
  ['capex', 'normal'], ['varAplicacoes', 'normal'], ['fci', 'total'],
  ['captacoes', 'normal'], ['amortizacoes', 'normal'], ['aportes', 'normal'], ['distribuicao', 'normal'], ['fcf', 'total'],
  ['deltaCaixa', 'total'],
]

export function linhasDFC(r: Resultado): Linha[] {
  const ms = r.meses.slice(1)
  return DFC_ORDEM.map(([k, estilo]) => ({
    chave: k, rotulo: REGISTRY.dfc[k].rotulo, estilo, dica: dica(REGISTRY.dfc[k]),
    valores: ms.map((m) => m.dfc[k]), total: r.anual.dfc[k],
  }))
}

export function linhasDividas(r: Resultado): Linha[] {
  const out: Linha[] = []
  const n = r.meses[0].dividas.length
  for (let i = 0; i < n; i++) {
    const d0 = r.meses[0].dividas[i]
    const nome = d0.descricao || `${d0.tipo === 'bancaria' ? 'Empréstimo' : 'Parcelamento tributário'} ${i + 1}`
    out.push(g(`g${i}`, nome))
    out.push({ chave: `s${i}`, rotulo: 'Saldo', estilo: 'total', valores: r.meses.map((m) => m.dividas[i].saldoFinal) })
    out.push({ chave: `cp${i}`, rotulo: 'Curto prazo (CPC 26)', estilo: 'sub', valores: r.meses.map((m) => m.dividas[i].cp) })
    out.push({ chave: `lp${i}`, rotulo: 'Longo prazo', estilo: 'sub', valores: r.meses.map((m) => m.dividas[i].lp) })
    out.push({ chave: `j${i}`, rotulo: 'Juros do mês', estilo: 'sub', valores: r.meses.map((m) => m.dividas[i].juros) })
    out.push({ chave: `a${i}`, rotulo: 'Amortização do mês', estilo: 'sub', valores: r.meses.map((m) => m.dividas[i].amortizacao) })
  }
  return out
}
