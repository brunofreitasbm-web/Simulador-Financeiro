import { describe, expect, it } from 'vitest'
import { calcular, calcularCenarios, checagemC6, CENARIOS_PADRAO, ENGINE_VERSION, REGISTRY, validar } from '../src'
import { cpLp, cronograma } from '../src/dividas'
import { BP_KEYS, DFC_KEYS, DRE_KEYS, IND_IDS, type Resultado } from '../src/types'
import { comercio, estresse, ex611 } from './fixtures'

const perto = (a: number, b: number, casas = 2) => expect(a).toBeCloseTo(b, casas)

export function checagensOk(r: Resultado) {
  const falhas = r.checagens.filter((c) => !c.ok)
  expect(falhas, JSON.stringify(falhas.slice(0, 5))).toEqual([])
}

describe('Dívidas (6.4)', () => {
  it('Price: exemplo da spec', () => {
    const c = cronograma({ tipo: 'bancaria', saldo: 100_000, taxa: 2, unidadeTaxa: 'am', prazoMeses: 12, sistema: 'price', carenciaMeses: 0, mesInicio: 0, parcelada: true }, 0, 30, 1)
    perto(c.juros[1] + c.amort[1], 9455.96)
    perto(c.juros[1], 2000); perto(c.amort[1], 7455.96); perto(c.saldo[1], 92544.04)
    perto(c.juros[2], 1850.88); perto(c.amort[2], 7605.08); perto(c.saldo[2], 84938.96)
    perto(c.juros[3], 1698.78); perto(c.amort[3], 7757.18); perto(c.saldo[3], 77181.78)
    perto(c.saldo[12], 0)
    const cl = cpLp(c, 0)
    perto(cl.cp, 100_000); perto(cl.lp, 0)
  })
  it('Price com i = 0 amortiza linearmente', () => {
    const c = cronograma({ tipo: 'bancaria', saldo: 1200, taxa: 0, unidadeTaxa: 'am', prazoMeses: 12, sistema: 'price', carenciaMeses: 0, mesInicio: 0, parcelada: true }, 0, 20, 1)
    perto(c.amort[5], 100); perto(c.saldo[12], 0)
  })
  it('SAC, bullet e carência', () => {
    const base = { tipo: 'bancaria' as const, saldo: 1200, taxa: 1, unidadeTaxa: 'am' as const, prazoMeses: 12, carenciaMeses: 0, mesInicio: 0, parcelada: true }
    const sac = cronograma({ ...base, sistema: 'sac' }, 0, 20, 1)
    perto(sac.amort[1], 100); perto(sac.juros[2], 11); perto(sac.saldo[12], 0)
    const bullet = cronograma({ ...base, sistema: 'bullet' }, 0, 20, 1)
    perto(bullet.amort[6], 0); perto(bullet.amort[12], 1200); perto(bullet.juros[12], 12)
    const car = cronograma({ ...base, sistema: 'sac', carenciaMeses: 3 }, 0, 20, 1)
    perto(car.amort[3], 0); perto(car.amort[4], 1200 / 9); perto(car.juros[3], 12); perto(car.saldo[12], 0)
  })
  it('tributária não parcelada acumula juros e fica 100% no CP', () => {
    const c = cronograma({ tipo: 'tributaria', saldo: 1000, taxa: 1, unidadeTaxa: 'am', prazoMeses: 12, sistema: 'sac', carenciaMeses: 0, mesInicio: 0, parcelada: false }, 0, 20, 1)
    perto(c.saldo[2], 1000 * 1.01 ** 2)
    expect(cpLp(c, 2).lp).toBe(0)
    expect(c.amort.every((x) => x === 0)).toBe(true)
  })
  it('dJuros só afeta bancária', () => {
    const b = cronograma({ tipo: 'bancaria', saldo: 1000, taxa: 2, unidadeTaxa: 'am', prazoMeses: 6, sistema: 'sac', carenciaMeses: 0, mesInicio: 0, parcelada: true }, 0, 10, 1.1)
    const t = cronograma({ tipo: 'tributaria', saldo: 1000, taxa: 2, unidadeTaxa: 'am', prazoMeses: 6, sistema: 'sac', carenciaMeses: 0, mesInicio: 0, parcelada: true }, 0, 10, 1.1)
    perto(b.juros[1], 22); perto(t.juros[1], 20)
  })
  it('captação planejada: entra caixa no mês, juros a partir do seguinte', () => {
    const c = cronograma({ tipo: 'bancaria', saldo: 1000, taxa: 1, unidadeTaxa: 'am', prazoMeses: 4, sistema: 'sac', carenciaMeses: 0, mesInicio: 3, parcelada: true }, 0, 10, 1)
    expect(c.saldo[2]).toBe(0); expect(c.captacao[3]).toBe(1000); expect(c.juros[3]).toBe(0)
    perto(c.juros[4], 10); perto(c.saldo[7], 0)
  })
})

describe('Exemplo 6.11 (mês 1)', () => {
  const r = calcular(ex611)
  const d = r.meses[1].dre
  it('linhas da DRE', () => {
    perto(d.rb, 100_000); perto(d.descontos, 2000); perto(d.impostos, 5880); perto(d.rl, 92_120)
    perto(d.cmv, 40_000); perto(d.comissoes, 2940); perto(d.taxaCartao, 900); perto(d.frete, 2000); perto(d.perdas, 600)
    perto(d.mc, 45_680); perto(d.ebitda, 15_680); perto(d.depreciacao, 1000); perto(d.ebit, 14_680)
    perto(d.despFinanceiras, 2000); perto(d.recFinanceiras, 500); perto(d.lair, 13_180)
  })
  it('indicadores do mês', () => {
    const i = r.indicadores.porMes[0]
    perto(i.mcPct as number, 0.4959, 4); perto(i.pec as number, 62_515.76, 0); perto(i.gao as number, 3.11, 2)
  })
  it('checagens', () => checagensOk(r))
})

describe('Integração', () => {
  for (const [nome, e] of [['ex611', ex611], ['comercio', comercio], ['estresse', estresse]] as const) {
    it(`${nome}: C1–C10 verdadeiras em todos os cenários`, () => {
      const rs = calcularCenarios(e, CENARIOS_PADRAO)
      for (const r of Object.values(rs)) { checagensOk(r); expect(r.meses).toHaveLength(13) }
      expect(checagemC6(e).ok).toBe(true)
    })
  }
  it('determinismo bit a bit e versão', () => {
    const a = calcular(comercio), b = calcular(comercio)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.engineVersion).toBe(ENGINE_VERSION)
  })
  it('C6: alavancas zero ≡ Atual', () => expect(checagemC6(comercio, CENARIOS_PADRAO[0].alavancas).ok).toBe(true))
  it('balanço de abertura fecha via PLUG0', () => {
    const b = calcular(comercio).meses[0].bp
    perto(b.ativo, b.passivoPL)
  })
  it('anual = soma dos meses', () => {
    const r = calcular(comercio)
    perto(r.anual.dre.rb, r.meses.slice(1).reduce((s, m) => s + m.dre.rb, 0))
    perto(r.anual.dfc.deltaCaixa, r.meses[12].bp.caixa - r.meses[0].bp.caixa)
  })
  it('contingências: ativo não reconhecido; possível só em nota; provável provisionada', () => {
    const r = calcular(comercio)
    expect(r.notas.ativosContingentes).toHaveLength(1)
    expect(r.notas.passivosPossiveis).toHaveLength(1)
    perto(r.meses[0].bp.provisoesCP + r.meses[0].bp.provisoesLP, 45_000)
    perto(r.meses[0].bp.provisoesCP, 30_000)
    perto(r.meses[12].bp.provisoesLP, 15_000); perto(r.meses[12].bp.provisoesCP, 0)
  })
  it('cheque especial incide sobre caixa de t−1 e gera alertas', () => {
    const r = calcular(estresse)
    expect(r.meses[1].dre.despFinCheque).toBeCloseTo(10_000 * 0.08, 2)
    const ids = r.alertas.map((a) => a.id)
    expect(ids).toContain('A_caixaNegativo')
    expect(ids).toContain('A_tributariaNaoParcelada')
    expect(ids).toContain('A_plNegativo')
  })
  it('indicadores null (nunca 0/NaN) quando a base é inválida', () => {
    const i = calcular(estresse).indicadores.anual
    expect(i.pmre).toBeNull(); expect(i.pmpc).toBeNull(); expect(i.co).toBeNull(); expect(i.ipl).toBeNull()
  })
  it('cenário pessimista piora o caixa final; otimista melhora', () => {
    const rs = calcularCenarios(comercio, CENARIOS_PADRAO)
    expect(rs.pessimista.meses[12].bp.caixa).toBeLessThan(rs.atual.meses[12].bp.caixa)
    expect(rs.otimista.meses[12].bp.caixa).toBeGreaterThan(rs.atual.meses[12].bp.caixa)
  })
  it('dReceita escala RB', () => {
    perto(calcular(comercio, { dReceita: 10 }).anual.dre.rb / calcular(comercio).anual.dre.rb, 1.1, 6)
  })
  it('captação planejada entra no FCF no mês', () => {
    perto(calcular(comercio).meses[5].dfc.captacoes, 80_000)
  })
  it('aporte e capex nos fluxos', () => {
    const r = calcular(comercio)
    perto(r.meses[6].dfc.aportes, 25_000); perto(r.meses[3].dfc.capex, -60_000)
    perto(r.meses[6].bp.capitalSocial, 125_000)
  })
})

describe('Validação', () => {
  it('bloqueia mix ≠ 100', () => {
    expect(validar({ ...ex611, historico: { ...ex611.historico, pctVista: 50 } }).ok).toBe(false)
  })
  it('bloqueia presumido sem atividade e imobilizado sem vida útil', () => {
    expect(validar({ ...ex611, empresa: { regime: 'presumido' } }).ok).toBe(false)
    expect(validar({ ...ex611, abertura: { ...ex611.abertura, vidaUtilMeses: undefined } }).ok).toBe(false)
  })
  it('bloqueia sazonalidade com média ≠ 1', () => {
    expect(validar({ ...ex611, projecao: { sazonalidade: Array(12).fill(1.2) } }).ok).toBe(false)
  })
  it('alertas de faixa', () => {
    const v = validar({ ...ex611, historico: { ...ex611.historico, taxaCartao: 7, pctInadimplencia: 12 } })
    expect(v.ok && v.alertas.map((a) => a.id)).toEqual(expect.arrayContaining(['V_taxaCartao', 'V_inadimplencia']))
  })
  it('calcular lança em entrada inválida', () => {
    expect(() => calcular({ ...ex611, historico: { ...ex611.historico, pctVista: 50 } })).toThrow()
  })
})

describe('Registro (6.14)', () => {
  it('paridade com o Resultado', () => {
    expect(Object.keys(REGISTRY.dre).sort()).toEqual([...DRE_KEYS].sort())
    expect(Object.keys(REGISTRY.bp).sort()).toEqual([...BP_KEYS].sort())
    expect(Object.keys(REGISTRY.dfc).sort()).toEqual([...DFC_KEYS].sort())
    expect(Object.keys(REGISTRY.indicadores).sort()).toEqual([...IND_IDS].sort())
    const r = calcular(comercio)
    expect(Object.keys(r.meses[1].dre).sort()).toEqual(Object.keys(REGISTRY.dre).sort())
    expect(Object.keys(r.indicadores.anual).sort()).toEqual(Object.keys(REGISTRY.indicadores).sort())
  })
})
