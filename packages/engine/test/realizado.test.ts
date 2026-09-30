import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { HistoricoSchema } from '../src/schema'
import {
  CAMPOS_REALIZADO, COLUNA_REALIZADO, competenciasAte, mesclarPremissas, montarPremissasDeRealizado, normalizarSazonalidade,
  type CampoRealizado, type RealizadoMensal,
} from '../src/realizado'

const perto = (a: number | undefined, b: number, casas = 2) => expect(a).toBeCloseTo(b, casas)

/** Mês completo: todos os campos com valor. */
function mesCheio(competencia: string, over: Partial<Record<CampoRealizado, number | null>> = {}): RealizadoMensal {
  const valores: Partial<Record<CampoRealizado, number | null>> = {
    receitaBruta: 100_000, receitaServicos: 90_000, receitaProdutos: 10_000, descontos: 2_000, cancelamentos: 500, qtdPedidos: 800,
    receitaDinheiro: 10_000, receitaPix: 20_000, receitaDebito: 10_000, receitaCredito: 30_000, receitaVoucher: 0, receitaPrazo: 30_000,
    inadimplencia: 600, glosas: 0,
    compras: 40_000, frete: 2_000, comissoes: 3_000, impostosVendas: 5_880, irCsll: 0,
    folha: 18_000, encargos: 2_000, temporarios: 1_000, proLabore: 6_000, repassesTerapeutas: 0,
    aluguel: 5_000, manutencao: 1_000, fixosOutros: 4_000, marketing: 3_000, distribuicao: 10_000,
    caixaFinal: 80_000, contasReceber: 25_000, contasPagar: 12_000, estoque: 40_000, passivoPrepago: 3_000, quebraCaixa: 20,
    ...over,
  }
  const campos = Object.fromEntries(CAMPOS_REALIZADO.map((c) => [c, { fonte: 'teste', status: valores[c] == null ? 'sem_dados' : 'ok' }]))
  return { competencia, valores, campos, status: 'ok', fechado: false }
}
const janela = competenciasAte('2026-09-30', 12)
const doze = () => janela.map((c) => mesCheio(c))

describe('Realizado → premissas', () => {
  it('janela de 12 competências termina no mês da data-base', () => {
    expect(janela[0]).toBe('2025-10'); expect(janela[11]).toBe('2026-09')
    expect(competenciasAte('2026-01', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
  it('colunas do banco em snake_case', () => {
    expect(COLUNA_REALIZADO.receitaBruta).toBe('receita_bruta')
    expect(COLUNA_REALIZADO.irCsll).toBe('ir_csll')
    expect(COLUNA_REALIZADO.qtdPedidos).toBe('qtd_pedidos')
  })
  it('12 meses completos: totais, mix = 100 e sem lacunas bloqueantes', () => {
    const a = montarPremissasDeRealizado(doze(), '2026-09-30')
    perto(a.historico.rb12, 1_200_000)
    perto(a.historico.compras12, 480_000)
    perto(a.historico.folha12, 240_000) // folha + encargos
    perto(a.historico.fixos12, 120_000)
    perto(a.historico.proLabore12, 72_000)
    perto(a.historico.pctComissao, 3)
    perto((a.historico.pctVista ?? 0) + (a.historico.pctPrazo ?? 0) + (a.historico.pctCartao ?? 0), 100)
    perto(a.historico.pctVista, 40); perto(a.historico.pctCartao, 30); perto(a.historico.pctPrazo, 30)
    perto(a.historico.pctInadimplencia, 2)
    perto(a.abertura.caixa0, 80_000); perto(a.abertura.cr0, 25_000); perto(a.abertura.estoque0, 40_000)
    expect(a.lacunas.filter((l) => l.nivel === 'bloqueante')).toEqual([])
    // o que saiu valida no schema do motor (com prazos digitados à parte)
    const parse = HistoricoSchema.safeParse({ ...a.historico, prazoRecebDias: 30, prazoPagFornecDias: 30 })
    expect(parse.success, JSON.stringify(parse.error?.issues)).toBe(true)
  })
  it('mês faltando: lacuna bloqueante e campo ausente', () => {
    const meses = doze().filter((m) => m.competencia !== '2026-03')
    const a = montarPremissasDeRealizado(meses, '2026-09-30')
    expect(a.historico.rb12).toBeUndefined()
    expect(a.lacunas.find((l) => l.campo === 'historico.rb12')?.motivo).toContain('2026-03')
    expect(a.lacunas.find((l) => l.campo === 'historico.fixos12')?.nivel).toBe('bloqueante')
  })
  it('campo null num mês: só aquele driver vira lacuna', () => {
    const meses = doze(); meses[4] = mesCheio(meses[4].competencia, { proLabore: null })
    const a = montarPremissasDeRealizado(meses, '2026-09-30')
    expect(a.historico.proLabore12).toBeUndefined()
    expect(a.historico.rb12).toBeDefined()
    expect(a.lacunas.some((l) => l.campo === 'historico.proLabore12' && l.nivel === 'bloqueante')).toBe(true)
  })
  it('sem pagamentos: lacuna no mix', () => {
    const meses = janela.map((c) => mesCheio(c, { receitaDinheiro: 0, receitaPix: 0, receitaDebito: 0, receitaCredito: 0, receitaVoucher: 0, receitaPrazo: 0 }))
    const a = montarPremissasDeRealizado(meses, '2026-09-30')
    expect(a.historico.pctVista).toBeUndefined()
    expect(a.lacunas.some((l) => l.campo === 'historico.pctVista')).toBe(true)
  })
  it('voucher conta como cartão; cobertura baixa gera aviso', () => {
    const meses = janela.map((c) => mesCheio(c, { receitaCredito: 0, receitaVoucher: 5_000, receitaPix: 5_000, receitaDinheiro: 0, receitaDebito: 0, receitaPrazo: 0 }))
    const a = montarPremissasDeRealizado(meses, '2026-09-30')
    perto(a.historico.pctCartao, 50); perto(a.historico.pctVista, 50); perto(a.historico.pctPrazo, 0)
    expect(a.lacunas.some((l) => l.campo === 'historico.pctVista' && l.nivel === 'aviso' && /cobrem/.test(l.motivo))).toBe(true)
  })
  it('sazonalidade pelo mês do calendário, média 1', () => {
    const meses = janela.map((c) => mesCheio(c, { receitaBruta: c === '2025-12' ? 200_000 : 100_000 }))
    const a = montarPremissasDeRealizado(meses, '2026-09-30')
    const s = a.projecao.sazonalidade!
    expect(s).toHaveLength(12)
    perto(s.reduce((x, y) => x + y, 0) / 12, 1, 3)
    expect(s[11]).toBeGreaterThan(s[0]) // dezembro é o pico
    perto(s[11] / s[0], 2, 2)
  })
  it('abertura vem do mês da data-base', () => {
    const meses = doze(); meses[11] = mesCheio('2026-09', { caixaFinal: 1_234, contasReceber: null })
    const a = montarPremissasDeRealizado(meses, '2026-09-30')
    perto(a.abertura.caixa0, 1_234)
    expect(a.abertura.cr0).toBeUndefined()
    expect(a.lacunas.some((l) => l.campo === 'abertura.cr0')).toBe(true)
  })
  it('mês parcial na janela gera aviso, não bloqueio', () => {
    const meses = doze(); meses[11] = { ...meses[11], status: 'parcial' }
    const a = montarPremissasDeRealizado(meses, '2026-09-30')
    expect(a.historico.rb12).toBeDefined()
    expect(a.lacunas.some((l) => l.nivel === 'aviso' && /parciais/.test(l.motivo))).toBe(true)
  })
  it('mesclarPremissas preserva o digitado sem sobrescrever', () => {
    const m = mesclarPremissas<{ a: number; b: number; c: number }>({ a: 1 }, { a: 9, b: 2, c: undefined }, false)
    expect(m.resultado).toEqual({ a: 1, b: 2 }); expect(m.aplicados).toEqual(['b']); expect(m.mantidos).toEqual(['a'])
    const s = mesclarPremissas<{ a: number; b: number }>({ a: 1 }, { a: 9, b: 2 }, true)
    expect(s.resultado).toEqual({ a: 9, b: 2 }); expect(s.mantidos).toEqual([])
  })
  it('normalizarSazonalidade: média 1; tudo zero vira 1', () => {
    const n = normalizarSazonalidade([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2])
    expect(n.every((x) => x === 1)).toBe(true)
    expect(normalizarSazonalidade(Array(12).fill(0))).toEqual(Array(12).fill(1))
  })
})

describe('Realizado — propriedades', () => {
  const valor = fc.option(fc.double({ min: 0, max: 1e6, noNaN: true }), { nil: null })
  const arbMes = (c: string) => fc.record(Object.fromEntries(CAMPOS_REALIZADO.map((k) => [k, valor]))).map(
    (valores): RealizadoMensal => ({ competencia: c, valores: valores as RealizadoMensal['valores'], campos: {}, status: 'ok', fechado: false }),
  )
  const arbMeses = fc.tuple(...janela.map(arbMes)).map((t) => [...t])

  it('mix, quando existe, soma 100 ± 0,01 e cada driver derivável está em historico OU nas lacunas bloqueantes', () => {
    fc.assert(fc.property(arbMeses, (meses) => {
      const a = montarPremissasDeRealizado(meses, '2026-09-30')
      const { pctVista, pctPrazo, pctCartao } = a.historico
      if (pctVista !== undefined) expect(Math.abs(pctVista + (pctPrazo ?? 0) + (pctCartao ?? 0) - 100)).toBeLessThanOrEqual(0.011)
      const bloq = new Set(a.lacunas.filter((l) => l.nivel === 'bloqueante').map((l) => l.campo))
      for (const k of ['rb12', 'compras12', 'folha12', 'fixos12', 'temporarios12', 'proLabore12', 'marketing12', 'distribuicao12', 'frete12', 'impVendas12', 'irCsll12', 'pctComissao', 'pctVista'] as const) {
        const tem = a.historico[k] !== undefined
        expect(tem !== bloq.has(`historico.${k}`), `${k}: presente=${tem} lacuna=${bloq.has(`historico.${k}`)}`).toBe(true)
      }
      for (const k of ['caixa0', 'cr0', 'estoque0'] as const) expect((a.abertura[k] !== undefined) !== bloq.has(`abertura.${k}`)).toBe(true)
    }), { numRuns: 500 })
  })
})
