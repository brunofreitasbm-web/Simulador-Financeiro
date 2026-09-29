import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calcular, checagemC6, type Alavancas, type EntradaBruta } from '../src'

const dinheiro = (max: number) => fc.integer({ min: 0, max }).map((x) => x * 10)
const taxa = (max: number) => fc.integer({ min: 0, max: max * 10 }).map((x) => x / 10)

const dividaArb = fc.record({
  tipo: fc.constantFrom('bancaria' as const, 'tributaria' as const),
  saldo: fc.integer({ min: 1, max: 500_000 }),
  taxa: taxa(5),
  unidadeTaxa: fc.constantFrom('am' as const, 'aa' as const),
  prazoMeses: fc.integer({ min: 1, max: 48 }),
  sistema: fc.constantFrom('price' as const, 'sac' as const, 'bullet' as const),
  carenciaMeses: fc.integer({ min: 0, max: 6 }),
  mesInicio: fc.integer({ min: 0, max: 14 }),
  parcelada: fc.boolean(),
})

const contArb = fc.record({
  natureza: fc.constantFrom('trabalhista' as const, 'civel' as const, 'tributaria' as const),
  polo: fc.constantFrom('passivo' as const, 'ativo' as const),
  valor: fc.integer({ min: 0, max: 200_000 }),
  probabilidade: fc.constantFrom('provavel' as const, 'possivel' as const, 'remota' as const),
  mesDesfecho: fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
})

const eventoArb = fc.oneof(
  fc.record({ tipo: fc.constant('capex' as const), mes: fc.integer({ min: 1, max: 12 }), valor: fc.integer({ min: 1, max: 200_000 }), vidaUtilMeses: fc.integer({ min: 1, max: 60 }) }),
  fc.record({ tipo: fc.constant('aporte' as const), mes: fc.integer({ min: 1, max: 12 }), valor: fc.integer({ min: 1, max: 200_000 }) }),
  fc.record({ tipo: fc.constant('contratacao' as const), mes: fc.integer({ min: 1, max: 12 }), custoMensalComEncargos: fc.integer({ min: 1, max: 20_000 }) }),
  fc.record({ tipo: fc.constant('reajusteFolha' as const), mes: fc.integer({ min: 1, max: 12 }), pct: fc.integer({ min: -30, max: 30 }) }),
)

const historicoArb = fc
  .record({
    rb12: fc.integer({ min: 10_000, max: 20_000_000 }),
    vista: fc.integer({ min: 0, max: 100 }),
    prazoShare: fc.integer({ min: 0, max: 100 }),
    descVista: taxa(30),
    prazoRecebDias: fc.integer({ min: 0, max: 180 }),
    prazoCartaoDias: fc.integer({ min: 0, max: 60 }),
    taxaCartao: taxa(8),
    pctAntecipado: fc.integer({ min: 0, max: 100 }),
    taxaAntecipacao: taxa(6),
    pctInadimplencia: taxa(20),
    pctComissao: taxa(15),
    comprasPct: fc.integer({ min: 0, max: 90 }),
    prazoPagFornecDias: fc.integer({ min: 0, max: 120 }),
    fretePct: taxa(8),
    impPct: taxa(25),
    folhaPct: fc.integer({ min: 0, max: 40 }),
    fixosPct: fc.integer({ min: 0, max: 25 }),
    proLabore12: dinheiro(30_000),
    marketingPct: taxa(5),
    distribuicaoPct: taxa(10),
  })
  .map((h) => {
    const pctVista = h.vista
    const pctPrazo = Math.floor(((100 - pctVista) * h.prazoShare) / 100)
    const pctCartao = 100 - pctVista - pctPrazo
    const rb = h.rb12
    return {
      rb12: rb, pctVista, pctPrazo, pctCartao, descVista: h.descVista, prazoRecebDias: h.prazoRecebDias,
      prazoCartaoDias: h.prazoCartaoDias, taxaCartao: h.taxaCartao, pctAntecipado: h.pctAntecipado,
      taxaAntecipacao: h.taxaAntecipacao, pctInadimplencia: h.pctInadimplencia, pctComissao: h.pctComissao,
      compras12: (rb * h.comprasPct) / 100, prazoPagFornecDias: h.prazoPagFornecDias,
      frete12: (rb * h.fretePct) / 100, impVendas12: (rb * h.impPct) / 100, irCsll12: 0,
      folha12: (rb * h.folhaPct) / 100, fixos12: (rb * h.fixosPct) / 100, proLabore12: h.proLabore12,
      marketing12: (rb * h.marketingPct) / 100, distribuicao12: (rb * h.distribuicaoPct) / 100,
    }
  })

const aberturaArb = fc.record({
  caixa0: fc.integer({ min: -100_000, max: 500_000 }),
  aplicacoes0: dinheiro(50_000),
  taxaAplicacao: taxa(15),
  unidadeTaxaAplicacao: fc.constantFrom('am' as const, 'aa' as const),
  estoque0: dinheiro(100_000),
  imobilizado0: dinheiro(50_000),
  vidaUtilMeses: fc.integer({ min: 1, max: 120 }),
  imoveis0: dinheiro(50_000),
  pctEdificacao: fc.integer({ min: 0, max: 100 }),
  intangivel0: dinheiro(20_000),
  vidaUtilIntangivelMeses: fc.integer({ min: 0, max: 60 }),
  capitalSocial: fc.integer({ min: 0, max: 500_000 }),
  dividas: fc.array(dividaArb, { maxLength: 4 }),
  contingencias: fc.array(contArb, { maxLength: 3 }),
  taxaChequeEspecial: taxa(12),
})

const sazArb = fc.array(fc.integer({ min: 50, max: 150 }), { minLength: 12, maxLength: 12 }).map((a) => {
  const m = a.reduce((s, x) => s + x, 0) / 12
  return a.map((x) => x / m)
})

export const entradaArb: fc.Arbitrary<EntradaBruta> = fc
  .record({
    regime: fc.constantFrom('simples' as const, 'presumido' as const, 'real' as const, 'mei' as const),
    mes: fc.integer({ min: 1, max: 12 }),
    historico: historicoArb,
    abertura: aberturaArb,
    cresc: fc.integer({ min: -3, max: 5 }),
    infl: fc.integer({ min: 0, max: 12 }),
    mktModo: fc.constantFrom('valor' as const, 'pctRB' as const),
    saz: sazArb,
    eventos: fc.array(eventoArb, { maxLength: 4 }),
  })
  .map((r) => ({
    empresa: { regime: r.regime, atividadePresumido: 'servicos' as const },
    dataBase: `2026-${String(r.mes).padStart(2, '0')}-28`,
    historico: r.historico,
    abertura: r.abertura,
    projecao: { crescimentoReceita: r.cresc, inflacaoCustos: r.infl, marketingModo: r.mktModo, sazonalidade: r.saz, eventos: r.eventos },
  }))

const alavancasArb: fc.Arbitrary<Partial<Alavancas>> = fc.record({
  dReceita: fc.integer({ min: -40, max: 40 }),
  dVariaveis: fc.integer({ min: -20, max: 30 }),
  dFixos: fc.integer({ min: -20, max: 30 }),
  dDistribuicao: fc.integer({ min: -100, max: 50 }),
  dInadimplencia: fc.integer({ min: -5, max: 10 }),
  dJuros: fc.integer({ min: -50, max: 50 }),
  dPrazoReceb: fc.integer({ min: -30, max: 60 }),
  dPrazoPag: fc.integer({ min: -30, max: 60 }),
})

describe('Propriedades (C1–C10 sempre verdadeiras)', () => {
  it('10.000 entradas válidas aleatórias, cenário Atual', () => {
    fc.assert(
      fc.property(entradaArb, (e) => {
        const r = calcular(e)
        const falhas = r.checagens.filter((c) => !c.ok)
        expect(falhas.slice(0, 3)).toEqual([])
      }),
      { numRuns: 10_000 },
    )
  }, 120_000)

  it('cenários aleatórios mantêm as invariantes e C6 vale', () => {
    fc.assert(
      fc.property(entradaArb, alavancasArb, (e, a) => {
        const r = calcular(e, a)
        expect(r.checagens.filter((c) => !c.ok).slice(0, 3)).toEqual([])
      }),
      { numRuns: 3_000 },
    )
    fc.assert(fc.property(entradaArb, (e) => checagemC6(e).ok), { numRuns: 200 })
  }, 120_000)

  it('monotonicidade: ↑RB (demais fixos) ⇒ ↑ ou = MC anual', () => {
    fc.assert(
      fc.property(entradaArb, fc.integer({ min: 1, max: 40 }), (e, up) => {
        const base = calcular(e, {}).anual.dre
        const mais = calcular(e, { dReceita: up }).anual.dre
        // MC = RL − variáveis: cresce quando cada R$ vendido tem margem ≥ 0; só garantimos onde a margem unitária é não negativa
        const margemUnit = base.rb > 0 ? base.mc / base.rb : 0
        if (margemUnit >= 0) expect(mais.mc).toBeGreaterThanOrEqual(base.mc - 0.01)
      }),
      { numRuns: 1_000 },
    )
  })

  it('↑dPrazoReceb ⇒ caixa final não aumenta (sem antecipação, sem inadimplência)', () => {
    fc.assert(
      fc.property(entradaArb, fc.integer({ min: 1, max: 60 }), (e, d) => {
        const sem = { ...e, historico: { ...e.historico, pctAntecipado: 0, taxaAntecipacao: 0, pctInadimplencia: 0 } }
        const a = calcular(sem, {}).meses[12].bp.caixa
        const b = calcular(sem, { dPrazoReceb: d }).meses[12].bp.caixa
        // cheque especial pode tornar o efeito não monótono; comparamos só sem caixa negativo em nenhum dos casos
        const ra = calcular(sem, {}), rb = calcular(sem, { dPrazoReceb: d })
        if (ra.meses.every((m) => m.bp.caixa >= 0) && rb.meses.every((m) => m.bp.caixa >= 0)) expect(b).toBeLessThanOrEqual(a + 0.01)
      }),
      { numRuns: 1_000 },
    )
  })
})
