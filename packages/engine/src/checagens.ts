import type { ChecagemResultado, Mes } from './types'
import { EPS } from './util'
import type { EntradaSimulacao } from './schema'

const chk = (id: string, mes: number, delta: number): ChecagemResultado => ({ id, mes, ok: Math.abs(delta) < EPS, delta })

/** Checagens C1–C5, C7–C9 (+ C10 caixa direto) — Seção 6.12. C6 é `checagemC6` (calcular.ts). */
export function checagens(meses: Mes[], entrada: EntradaSimulacao, resultadoSemChecagens: unknown): ChecagemResultado[] {
  const out: ChecagemResultado[] = []
  const h = entrada.historico
  out.push(chk('C5_mix', 0, h.pctVista + h.pctPrazo + h.pctCartao - 100))
  for (const m of meses) {
    const b = m.bp
    out.push(chk('C1_balanco', m.t, b.ativo - b.passivoPL))
    // C3: identidade de Fleuriet
    const ncg = b.contasReceber - b.pdd + b.estoque - (b.fornecedores + b.contasAPagar)
    const cdg = b.pl + b.pnc - b.anc
    const tes = cdg - ncg
    const alt = b.caixa + b.aplicacoes - (b.emprestimosCP + b.parcelamentosCP + b.provisoesCP)
    out.push(chk('C3_tesouraria', m.t, tes - alt))
    // C4: saldo = saldo anterior + captação + juros capitalizados − amortização
    let d4 = 0
    for (const d of m.dividas) {
      if (m.t === 0) continue
      d4 = Math.max(d4, Math.abs(d.saldoFinal - (d.saldoInicial + d.captacao + d.jurosCapitalizados - d.amortizacao)))
    }
    out.push(chk('C4_dividas', m.t, d4))
    if (m.t === 0) continue
    const prev = meses[m.t - 1]
    out.push(chk('C2_caixa', m.t, b.caixa - prev.bp.caixa - m.dfc.deltaCaixa))
    out.push(chk('C7_estoque', m.t, prev.aux.estoqueFinal + m.aux.compras - m.dre.cmv - m.aux.estoqueFinal))
    out.push(chk('C8_lucrosAcum', m.t, b.lucrosAcumulados - (prev.bp.lucrosAcumulados + m.dre.ll - m.dre.distribuicao)))
    out.push(chk('C10_caixaDireto', m.t, b.caixa - m.aux.caixaDireto))
  }
  out.push({ id: 'C9_semNaN', mes: 0, ok: semNaN({ meses, r: resultadoSemChecagens }), delta: 0 })
  return out
}

export function semNaN(x: unknown): boolean {
  if (typeof x === 'number') return Number.isFinite(x)
  if (Array.isArray(x)) return x.every(semNaN)
  if (x && typeof x === 'object') return Object.values(x).every(semNaN)
  return true
}
