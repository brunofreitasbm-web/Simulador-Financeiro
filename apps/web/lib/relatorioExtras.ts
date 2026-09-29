import { cronograma, cpLp, formatarBRL, formatarPct, taxaMensal, type Resultado } from '@sf/engine'
import type { Rascunho } from './rascunho'
import { ROTULOS } from './rotulos'

/** Resumo por empréstimo bancário: principal, taxa, parcela, juros totais e CP/LP na abertura. */
export interface ResumoEmprestimo {
  nome: string; sistema: string; principal: number; taxaMensal: number; prazo: number; carencia: number
  primeiraParcela: number | null; ultimaParcela: number | null; totalJuros: number; cp: number; lp: number; mesInicio: number
}

export function resumoEmprestimos(r: Rascunho): ResumoEmprestimo[] {
  return r.abertura.dividas
    .filter((d) => d.tipo === 'bancaria' && Number(d.saldo) > 0 && Number(d.prazoMeses) > 0)
    .map((d, i) => {
      const c = cronograma({ sistema: 'price', carenciaMeses: 0, mesInicio: 0, parcelada: true, ...d } as never, i, r.horizonte + 14, 1)
      const L = c.saldo.length
      let totalJuros = 0
      const parcelas: number[] = []
      for (let t = 1; t < L; t++) {
        totalJuros += c.juros[t]
        if (c.juros[t] + c.amort[t] > 0) parcelas.push(c.juros[t] + c.amort[t])
      }
      const ref = c.inicio
      const { cp, lp } = cpLp(c, ref)
      return {
        nome: d.descricao || `Empréstimo ${i + 1}`, sistema: { price: 'Price', sac: 'SAC', bullet: 'Bullet' }[d.sistema ?? 'price'] as string,
        principal: Number(d.saldo), taxaMensal: taxaMensal(Number(d.taxa), d.unidadeTaxa), prazo: d.prazoMeses, carencia: d.carenciaMeses ?? 0,
        primeiraParcela: parcelas[0] ?? null, ultimaParcela: parcelas[parcelas.length - 1] ?? null, totalJuros, cp, lp, mesInicio: d.mesInicio ?? 0,
      }
    })
}

/** Carteira de recebíveis na abertura por faixa de vencimento (liquidação linear do saldo — Seção 5.4). */
export interface FaixaRecebiveis { faixa: string; nominal: number; desvalorizacao: number; ajustado: number; acumulado: number }

export function recebiveisPorFaixa(r: Rascunho, res: Resultado): { total: number; ajustado: number; entradaMensal: number; faixas: FaixaRecebiveis[] } {
  const cr0 = res.meses[0].bp.contasReceber
  const h = r.historico
  const nMeses = Math.max(1, Math.ceil((h.prazoRecebDias ?? 0) / 30))
  const taxa = (h.taxaAntecipacao ?? 0) / 100
  const buckets = [
    { faixa: '0–30 dias', de: 1, ate: 1 }, { faixa: '31–60 dias', de: 2, ate: 2 }, { faixa: '61–90 dias', de: 3, ate: 3 }, { faixa: 'Acima de 90 dias', de: 4, ate: 999 },
  ]
  let acum = 0
  const faixas = buckets.map((b) => {
    let nominal = 0, desv = 0
    for (let j = Math.max(1, b.de); j <= Math.min(nMeses, b.ate); j++) {
      const v = cr0 / nMeses
      nominal += v
      desv += v * taxa * j // custo de antecipar o vencimento (taxa a.m. × meses até receber)
    }
    acum += nominal - desv
    return { faixa: b.faixa, nominal, desvalorizacao: desv, ajustado: nominal - desv, acumulado: acum }
  })
  const ajustado = faixas.reduce((s, f) => s + f.ajustado, 0)
  return { total: cr0, ajustado, entradaMensal: cr0 / nMeses, faixas }
}

/** Todas as premissas informadas, agrupadas por bloco, com rótulo e valor legíveis. */
export interface BlocoPremissas { titulo: string; itens: [string, string][] }

const brl = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : formatarBRL(Number(v), 0))
const pct = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : `${Number(v).toLocaleString('pt-BR')}%`)
const dias = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : `${Number(v)} dias`)

export function premissasPorBloco(r: Rascunho): BlocoPremissas[] {
  const h = r.historico as Record<string, unknown>
  const a = r.abertura as Record<string, unknown>
  const p = (k: string, f: (v: unknown) => string): [string, string] => [ROTULOS[`historico.${k}`] ?? k, f(h[k])]
  const q = (k: string, f: (v: unknown) => string): [string, string] => [ROTULOS[`abertura.${k}`] ?? k, f(a[k])]
  const num = (v: unknown) => (v === undefined || v === null ? '—' : String(v))
  const blocos: BlocoPremissas[] = [
    { titulo: 'Faturamento e canais de venda', itens: [p('rb12', brl), p('pctVista', pct), p('pctPrazo', pct), p('pctCartao', pct), p('descVista', pct), p('prazoRecebDias', dias), p('prazoCartaoDias', dias), p('taxaCartao', pct)] },
    { titulo: 'Recebíveis e antecipação', itens: [p('pctAntecipado', pct), p('taxaAntecipacao', pct), p('pctInadimplencia', pct), [ROTULOS['abertura.cr0'], brl(a.cr0)]] },
    { titulo: 'Custos variáveis e impostos', itens: [p('pctComissao', pct), p('compras12', brl), p('prazoPagFornecDias', dias), p('frete12', brl), p('impVendas12', brl), p('irCsll12', brl)] },
    { titulo: 'Estrutura fixa', itens: [p('folha12', brl), p('temporarios12', brl), p('proLabore12', brl), p('fixos12', brl), p('marketing12', brl), p('distribuicao12', brl)] },
    { titulo: 'Caixa, estoque e ativos', itens: [q('caixa0', brl), q('aplicacoes0', brl), q('taxaAplicacao', (v) => `${pct(v)} ${a.unidadeTaxaAplicacao === 'aa' ? 'a.a.' : 'a.m.'}`), q('estoque0', brl), q('imobilizado0', brl), q('vidaUtilMeses', num), q('imoveis0', brl), q('pctEdificacao', pct), q('intangivel0', brl), q('capitalSocial', brl)] },
  ]
  const dv = r.abertura.dividas
  blocos.push({
    titulo: 'Dívidas',
    itens: dv.length ? dv.map((d, i): [string, string] => [
      `${i + 1}. ${d.descricao || (d.tipo === 'bancaria' ? 'Bancária' : 'Tributária')}`,
      `${brl(d.saldo)} · ${d.taxa}% ${d.unidadeTaxa === 'aa' ? 'a.a.' : 'a.m.'} · ${d.prazoMeses} meses · ${d.sistema ?? 'price'}${d.tipo === 'tributaria' && d.parcelada === false ? ' · não parcelada' : ''}${d.mesInicio ? ` · entra no mês ${d.mesInicio}` : ''}`,
    ]) : [['Nenhuma dívida informada', '—']],
  })
  const ct = r.abertura.contingencias
  blocos.push({
    titulo: 'Contingências judiciais',
    itens: ct.length ? ct.map((c, i): [string, string] => [
      `${i + 1}. ${c.natureza} — ${c.polo === 'ativo' ? 'a favor da empresa' : 'contra a empresa'}`,
      `${brl(c.valor)} · ${c.probabilidade}${c.mesDesfecho ? ` · desfecho no mês ${c.mesDesfecho}` : ''}`,
    ]) : [['Nenhum processo informado', '—']],
  })
  const pj = r.projecao
  blocos.push({
    titulo: 'Projeção',
    itens: [
      ['Crescimento da receita (ao mês)', pct(pj.crescimentoReceita)], ['Reajuste dos gastos fixos (ao ano)', pct(pj.inflacaoCustos)],
      ['Marketing', pj.marketingModo === 'pctRB' ? '% da receita bruta' : 'Valor fixo'],
      ['Sazonalidade (jan→dez)', (pj.sazonalidade ?? []).map((x) => x.toLocaleString('pt-BR', { maximumFractionDigits: 2 })).join(' · ')],
      ...pj.eventos.map((e, i): [string, string] => [
        `Evento ${i + 1}: ${{ capex: 'investimento', aporte: 'aporte', contratacao: 'contratação', reajusteFolha: 'reajuste da folha' }[e.tipo]}`,
        `mês ${e.mes} · ${e.tipo === 'contratacao' ? brl(e.custoMensalComEncargos) : e.tipo === 'reajusteFolha' ? pct(e.pct) : brl(e.valor)}`,
      ]),
    ],
  })
  return blocos
}

export { formatarPct }
