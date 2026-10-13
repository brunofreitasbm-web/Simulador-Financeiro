import { describe, expect, it } from 'vitest'
import {
  COLUNAS_FECHAMENTO, SCHEMA_FECHAMENTO, esqueletoSemFonte, extrairFechamento, selecionarUnidade, validarFechamento,
} from '../src/fechamento'

const base = (over: Record<string, unknown> = {}) => ({
  schema: SCHEMA_FECHAMENTO,
  competencia: '2026-09',
  gerado_em: '2026-09-27T06:20:00.000Z',
  sistema: 'pdv',
  repo: 'brunofreitasbm-web/faca_amigos',
  unidades: [{ chave: 'u-1', rotulo: 'Playground', valores: { receita_bruta: 35265.58 }, campos: { receita_bruta: { status: 'ok', obs: 'fechamento do PDV' } } }],
  ...over,
})

describe('validarFechamento', () => {
  it('aceita um fechamento bem formado', () => {
    const r = validarFechamento(base())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.avisos).toEqual([])
    expect(r.fechamento.competencia).toBe('2026-09')
    expect(r.fechamento.unidades[0].valores.receita_bruta).toBe(35265.58)
  })

  it('recusa schema desconhecido, competência torta e sistema inventado', () => {
    for (const [campo, valor, agulha] of [
      ['schema', 'sf.fechamento/2', 'schema'],
      ['competencia', '2026-13', 'competencia'],
      ['competencia', 'setembro', 'competencia'],
      ['sistema', 'erp', 'sistema'],
    ] as const) {
      const r = validarFechamento(base({ [campo]: valor }))
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.erros.join(' ')).toContain(agulha)
    }
  })

  it('recusa arquivo sem unidades e unidade sem chave', () => {
    expect(validarFechamento(base({ unidades: [] })).ok).toBe(false)
    const r = validarFechamento(base({ unidades: [{ valores: { receita_bruta: 1 } }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erros.join(' ')).toContain('chave')
  })

  it('descarta coluna desconhecida e valor não numérico como aviso, sem derrubar o mês', () => {
    const r = validarFechamento(base({
      unidades: [{ chave: 'u-1', valores: { receita_bruta: 10, campo_que_nao_existe: 5, receita_pix: 'abc' } }],
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.fechamento.unidades[0].valores)).toEqual(['receita_bruta'])
    expect(r.avisos).toHaveLength(2)
  })

  it('aceita número em string (planilha) e null explícito', () => {
    const r = validarFechamento(base({ unidades: [{ chave: 'u-1', valores: { receita_bruta: '1.234,56'.replace('.', '').replace(',', '.'), receita_prazo: null } }] }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fechamento.unidades[0].valores.receita_bruta).toBe(1234.56)
    expect(r.fechamento.unidades[0].valores.receita_prazo).toBeNull()
  })

  it('acusa status inválido', () => {
    const r = validarFechamento(base({
      unidades: [{ chave: 'u-1', valores: { receita_bruta: 1 }, campos: { receita_bruta: { status: 'mais_ou_menos' } } }],
    }))
    expect(r.ok).toBe(false)
  })

  it('avisa quando campos cita chave sem valor', () => {
    const r = validarFechamento(base({
      unidades: [{ chave: 'u-1', valores: { receita_bruta: 1 }, campos: { receita_pix: { status: 'ok' }, receita_bruta: { status: 'ok' } } }],
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.avisos.join(' ')).toContain('receita_pix')
    expect(r.fechamento.unidades[0].campos).toEqual({ receita_bruta: { status: 'ok', obs: null } })
  })
})

describe('selecionarUnidade', () => {
  const ok = validarFechamento(base({
    unidades: [
      { chave: 'u-1', rotulo: 'Playground', valores: { receita_bruta: 1 } },
      { chave: 'u-2', rotulo: 'Circuito do Parque', valores: { receita_bruta: 2 } },
    ],
  }))
  const f = ok.ok ? ok.fechamento : null

  it('casa pela chave, ignorando caixa e espaços', () => {
    expect(selecionarUnidade(f!, ' U-2 ')?.chave).toBe('u-2')
  })

  it('casa pelo rótulo quando a chave não bate', () => {
    expect(selecionarUnidade(f!, 'circuito do parque')?.chave).toBe('u-2')
  })

  it('devolve null quando não acha', () => {
    expect(selecionarUnidade(f!, 'u-9')).toBeNull()
  })
})

describe('extrairFechamento', () => {
  it('só devolve as colunas afirmadas e herda status/obs', () => {
    const ok = validarFechamento(base({
      unidades: [{
        chave: 'u-1',
        valores: { receita_bruta: 100, folha: null, ir_csll: null },
        campos: { ir_csll: { status: 'sem_dados', obs: 'nada pago no mês' } },
        detalhes: { pedidos: 42 },
      }],
    }))
    if (!ok.ok) throw new Error('fechamento inválido')
    const e = extrairFechamento(ok.fechamento.unidades[0], { fonte: 'github', rotuloFonte: 'PDV FaçaAmigos' })

    expect(Object.keys(e.valores).sort()).toEqual(['folha', 'ir_csll', 'receita_bruta'])
    expect(e.campos.folha.status).toBe('sem_dados')
    expect(e.campos.receita_bruta.status).toBe('ok')
    expect(e.campos.receita_bruta.obs).toBe('fechamento publicado por PDV FaçaAmigos')
    expect(e.campos.receita_bruta.fonte).toBe('github')
    expect(e.campos.ir_csll.status).toBe('sem_dados')
    expect(e.campos.ir_csll.obs).toBe('nada pago no mês')
    expect(e.detalhes).toEqual({ pedidos: 42 })
    expect(Number.isNaN(Date.parse(e.campos.receita_bruta.atualizado_em))).toBe(false)
  })

  it('ignora sem_fonte: declaração de ausência de fonte não zera campo de outra fonte', () => {
    const ok = validarFechamento(base({
      unidades: [{
        chave: 'u-1',
        valores: { receita_bruta: null, folha: 1234 },
        campos: {
          receita_bruta: { status: 'sem_fonte', obs: 'o RH não conhece receita' },
          folha: { status: 'ok' },
        },
      }],
    }))
    if (!ok.ok) throw new Error('fechamento inválido')
    const e = extrairFechamento(ok.fechamento.unidades[0], { fonte: 'github' })
    expect(Object.keys(e.valores)).toEqual(['folha'])
    expect(e.campos.receita_bruta).toBeUndefined()
  })

  it('com incluirSemFonte devolve o artefato cru para inspeção', () => {
    const ok = validarFechamento(base({
      unidades: [{ chave: 'u-1', valores: { receita_bruta: null }, campos: { receita_bruta: { status: 'sem_fonte', obs: 'não sei' } } }],
    }))
    if (!ok.ok) throw new Error('fechamento inválido')
    const e = extrairFechamento(ok.fechamento.unidades[0], { fonte: 'github', incluirSemFonte: true })
    expect(e.campos.receita_bruta.status).toBe('sem_fonte')
    expect(e.valores.receita_bruta).toBeNull()
  })

  it('null sem declaração vira sem_dados (a fonte tem o campo, o mês veio vazio)', () => {
    const ok = validarFechamento(base({ unidades: [{ chave: 'u-1', valores: { receita_bruta: null } }] }))
    if (!ok.ok) throw new Error('fechamento inválido')
    expect(extrairFechamento(ok.fechamento.unidades[0], { fonte: 'github' }).campos.receita_bruta.status).toBe('sem_dados')
  })

  it('ignora coluna fora da lista branca da RPC', () => {
    const ok = validarFechamento(base({ unidades: [{ chave: 'u-1', valores: { receita_bruta: 1 } }] }))
    if (!ok.ok) throw new Error('fechamento inválido')
    const u = { ...ok.fechamento.unidades[0], valores: { receita_bruta: 1, id: 7 } }
    expect(Object.keys(extrairFechamento(u, { fonte: 'github' }).valores)).toEqual(['receita_bruta'])
  })
})

describe('esqueletoSemFonte', () => {
  it('cobre todas as colunas do realizado', () => {
    const e = esqueletoSemFonte('o sistema não registra este dado')
    expect(Object.keys(e.valores).sort()).toEqual([...COLUNAS_FECHAMENTO].sort())
    expect(Object.values(e.campos).every((c) => c.status === 'sem_fonte')).toBe(true)
    expect(e.valores.receita_bruta).toBeNull()
  })
})
